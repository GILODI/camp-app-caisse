-- ============================================================================
-- Ajout des clôtures périodiques (archivage ISCA) — à coller dans
-- Supabase > SQL Editor et exécuter une fois. Additive : ajoute une table
-- et des fonctions, ne modifie aucune donnée existante. Repose sur la
-- colonne events.is_test (ajoutée ici de façon idempotente si absente).
-- ============================================================================

alter table public.events add column if not exists is_test boolean not null default false;

-- ----------------------------------------------------------------------------
-- clotures : verrouillage périodique. Une clôture "jour" fige et
-- empreinte-numérote (hash) l'ensemble des tickets d'une date de vente ;
-- une fois posée, plus aucune création/annulation de ticket n'est possible
-- sur cette date. Une clôture "evenement" fige l'ensemble de l'événement,
-- une fois tous ses jours de vente déjà clôturés individuellement.
-- ----------------------------------------------------------------------------
create table if not exists public.clotures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in ('jour', 'evenement')),
  periode date,
  nb_tickets integer not null,
  total_ttc numeric(10,2) not null,
  hash text not null,
  closed_by text,
  closed_at timestamptz not null default now()
);

create unique index if not exists clotures_jour_idx
  on public.clotures (event_id, periode)
  where type = 'jour';

create unique index if not exists clotures_evenement_idx
  on public.clotures (event_id)
  where type = 'evenement';

alter table public.clotures enable row level security;

drop policy if exists "lecture publique clotures" on public.clotures;
create policy "lecture publique clotures" on public.clotures for select using (true);

-- Verrouillage : create_ticket refuse toute création/correction de ticket
-- sur une date déjà clôturée.
create or replace function public.create_ticket(
  p_event_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb,
  p_remplace_ticket_id uuid default null
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
as $$
declare
  v_vente_date date := (now() at time zone 'Europe/Paris')::date;
  v_numero integer;
  v_ticket_id uuid;
  v_total numeric(10,2);
  v_item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un ticket doit contenir au moins une ligne';
  end if;

  if exists (
    select 1 from public.clotures
    where event_id = p_event_id and type = 'jour' and periode = v_vente_date
  ) then
    raise exception 'Journée du % déjà clôturée : impossible d''ajouter ou de corriger un ticket sur cette date', v_vente_date;
  end if;

  select coalesce(sum((elem->>'prix_unitaire')::numeric * (elem->>'quantite')::integer), 0)
    into v_total
    from jsonb_array_elements(p_items) as elem;

  v_numero := public.next_ticket_number(p_event_id, v_vente_date);

  insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc, remplace_ticket_id)
  values (p_event_id, v_numero, v_vente_date, p_vendeur, p_mode_paiement, v_total, p_remplace_ticket_id)
  returning tickets.id into v_ticket_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.ticket_items (ticket_id, reference, designation, prix_unitaire, pvp_ttc, prix_modifie, quantite)
    values (
      v_ticket_id,
      v_item->>'reference',
      v_item->>'designation',
      (v_item->>'prix_unitaire')::numeric,
      nullif(v_item->>'pvp_ttc', '')::numeric,
      coalesce((v_item->>'prix_modifie')::boolean, false),
      (v_item->>'quantite')::integer
    );
  end loop;

  return query select v_ticket_id, v_numero, v_vente_date, v_total;
end;
$$;

-- Verrouillage : cancel_ticket refuse toute annulation sur une date
-- déjà clôturée.
create or replace function public.cancel_ticket(
  p_ticket_id uuid,
  p_motif text,
  p_by text
)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from public.tickets t
    join public.clotures c
      on c.event_id = t.event_id and c.type = 'jour' and c.periode = t.vente_date
    where t.id = p_ticket_id
  ) then
    raise exception 'Journée déjà clôturée : impossible d''annuler ce ticket';
  end if;

  update public.tickets
  set statut = 'ANNULE',
      motif_annulation = p_motif,
      cancelled_at = now(),
      cancelled_by = p_by
  where id = p_ticket_id
    and statut = 'VALIDE';

  if not found then
    raise exception 'Ticket introuvable ou déjà annulé';
  end if;
end;
$$;

-- Clôture d'une journée de vente.
create or replace function public.close_day(p_event_id uuid, p_vente_date date, p_by text)
returns public.clotures
language plpgsql
as $$
declare
  v_nb_tickets integer;
  v_total numeric(10,2);
  v_hash text;
  v_row public.clotures;
begin
  select count(*), coalesce(sum(total_ttc) filter (where statut = 'VALIDE'), 0)
    into v_nb_tickets, v_total
    from public.tickets
    where event_id = p_event_id and vente_date = p_vente_date;

  if v_nb_tickets = 0 then
    raise exception 'Aucun ticket pour le %, rien à clôturer', p_vente_date;
  end if;

  select encode(
      digest(string_agg(numero || ':' || total_ttc || ':' || statut, ',' order by numero), 'sha256'),
      'hex'
    )
    into v_hash
    from public.tickets
    where event_id = p_event_id and vente_date = p_vente_date;

  insert into public.clotures (event_id, type, periode, nb_tickets, total_ttc, hash, closed_by)
  values (p_event_id, 'jour', p_vente_date, v_nb_tickets, v_total, v_hash, p_by)
  returning * into v_row;

  return v_row;
end;
$$;

-- Clôture de l'événement entier — seulement si tous ses jours de vente
-- sont déjà clôturés individuellement.
create or replace function public.close_event(p_event_id uuid, p_by text)
returns public.clotures
language plpgsql
as $$
declare
  v_open_days integer;
  v_nb_tickets integer;
  v_total numeric(10,2);
  v_hash text;
  v_row public.clotures;
begin
  select count(distinct t.vente_date) into v_open_days
    from public.tickets t
    where t.event_id = p_event_id
      and not exists (
        select 1 from public.clotures c
        where c.event_id = t.event_id and c.type = 'jour' and c.periode = t.vente_date
      );

  if v_open_days > 0 then
    raise exception '% jour(s) de vente pas encore clôturé(s) — clôture-les d''abord', v_open_days;
  end if;

  select count(*), coalesce(sum(total_ttc) filter (where statut = 'VALIDE'), 0)
    into v_nb_tickets, v_total
    from public.tickets
    where event_id = p_event_id;

  if v_nb_tickets = 0 then
    raise exception 'Aucun ticket pour cet événement, rien à clôturer';
  end if;

  select encode(
      digest(string_agg(numero || ':' || total_ttc || ':' || statut, ',' order by vente_date, numero), 'sha256'),
      'hex'
    )
    into v_hash
    from public.tickets
    where event_id = p_event_id;

  insert into public.clotures (event_id, type, periode, nb_tickets, total_ttc, hash, closed_by)
  values (p_event_id, 'evenement', null, v_nb_tickets, v_total, v_hash, p_by)
  returning * into v_row;

  return v_row;
end;
$$;

-- reset_event_test_data : vide aussi les clôtures d'un événement de test
-- (sinon des clôtures resteraient orphelines après suppression des tickets
-- qu'elles concernaient).
create or replace function public.reset_event_test_data(p_event_id uuid)
returns void
language plpgsql
as $$
declare
  v_is_test boolean;
begin
  select is_test into v_is_test from public.events where id = p_event_id;

  if not found then
    raise exception 'Événement introuvable';
  end if;
  if v_is_test is not true then
    raise exception 'Cet événement n''est pas marqué comme événement de test — suppression refusée';
  end if;

  delete from public.factures where event_id = p_event_id;
  delete from public.tickets where event_id = p_event_id;
  delete from public.mouvements_stock where event_id = p_event_id;
  delete from public.caisse_comptages where event_id = p_event_id;
  delete from public.ticket_counters where event_id = p_event_id;
  delete from public.clotures where event_id = p_event_id;
end;
$$;
