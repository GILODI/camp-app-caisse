-- ============================================================================
-- Date de la vente = date où le vendeur a encaissé, pas celle de la
-- transmission.
--
-- Le problème : create_ticket datait le ticket avec now() au moment où le
-- serveur le reçoit. Une vente encaissée à 23h50 hors ligne puis transmise
-- le lendemain matin portait donc la date du lendemain : la caisse espèces
-- du premier jour ne correspondait plus à ses ventes espèces.
--
-- La correction : le téléphone envoie l'heure réelle de la vente (vendu_le),
-- le serveur en déduit la date (fuseau Europe/Paris).
--
-- Deux garde-fous, parce que l'heure d'un téléphone n'est pas fiable :
--   1. vendu_le n'est retenu que s'il date de moins de 48 h et n'est pas dans
--      le futur (5 min de tolérance). Sinon il est ignoré : la vente prend la
--      date du jour, comme avant. Un téléphone mal réglé ne peut donc pas
--      placer une vente sur un jour au hasard.
--   2. Si la journée de la vente est DÉJÀ CLÔTURÉE, on ne la rouvre jamais :
--      la vente est enregistrée à la date du jour, et vendu_le conserve
--      l'heure réelle. Rien n'est perdu, la journée figée reste intacte, et
--      l'écart de date reste visible dans les données.
--
-- À coller dans Supabase > SQL Editor et exécuter une fois, EN ENTIER.
-- À EXÉCUTER AVANT la fusion du code côté application.
--
-- ATTENTION — cette migration change la signature de create_ticket et de
-- create_ticket_idempotent (un paramètre optionnel en plus). C'est
-- exactement le cas qui a déjà cassé la production trois fois : « Could not
-- choose the best candidate function », quand l'ancienne signature subsiste
-- à côté de la nouvelle. Les anciennes sont donc supprimées ici
-- explicitement, dans la même transaction, et un contrôle final annule
-- TOUT si plus d'une version de ces fonctions existe.
--
-- Compatible avec le code actuellement en ligne : les nouveaux paramètres
-- sont optionnels, les anciens appels continuent de fonctionner.
-- ============================================================================

begin;

alter table public.tickets add column if not exists vendu_le timestamptz;

-- Anciennes signatures : à supprimer AVANT de créer les nouvelles.
drop function if exists public.create_ticket_idempotent(uuid, uuid, text, text, jsonb);
drop function if exists public.create_ticket(uuid, text, text, jsonb, uuid);

create or replace function public.create_ticket(
  p_event_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb,
  p_remplace_ticket_id uuid default null,
  p_vendu_le timestamptz default null
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_vente_date date := (now() at time zone 'Europe/Paris')::date;
  v_vendu_le timestamptz := null;
  v_numero integer;
  v_ticket_id uuid;
  v_total numeric(10,2);
  v_item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un ticket doit contenir au moins une ligne';
  end if;

  -- Date de la vente : l'heure réelle de l'encaissement si elle est plausible
  -- (moins de 48 h, pas dans le futur), sinon l'heure de réception.
  if p_vendu_le is not null
     and p_vendu_le >= now() - interval '48 hours'
     and p_vendu_le <= now() + interval '5 minutes' then
    v_vendu_le := p_vendu_le;
    v_vente_date := (p_vendu_le at time zone 'Europe/Paris')::date;

    -- Journée de la vente déjà clôturée : on ne la rouvre jamais. La vente
    -- est enregistrée à la date du jour ; vendu_le garde l'heure réelle.
    if exists (
      select 1 from public.clotures
      where event_id = p_event_id and type = 'jour' and periode = v_vente_date
    ) then
      v_vente_date := v_aujourdhui;
    end if;
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

  insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc, remplace_ticket_id, vendu_le)
  values (p_event_id, v_numero, v_vente_date, p_vendeur, p_mode_paiement, v_total, p_remplace_ticket_id, v_vendu_le)
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

create or replace function public.create_ticket_idempotent(
  p_client_ref uuid,
  p_event_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb,
  p_vendu_le timestamptz default null
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ticket record;
begin
  if p_client_ref is null then
    raise exception 'Référence de vente requise';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_ref::text, 0));

  select t.id, t.numero, t.vente_date, t.total_ttc
    into v_ticket
    from public.tickets t
   where t.event_id = p_event_id
     and t.client_ref = p_client_ref;

  if found then
    return query select v_ticket.id, v_ticket.numero, v_ticket.vente_date, v_ticket.total_ttc;
    return;
  end if;

  select c.id, c.numero, c.vente_date, c.total_ttc
    into v_ticket
    from public.create_ticket(
      p_event_id => p_event_id,
      p_vendeur => p_vendeur,
      p_mode_paiement => p_mode_paiement,
      p_items => p_items,
      p_vendu_le => p_vendu_le
    ) as c;

  update public.tickets t
     set client_ref = p_client_ref
   where t.id = v_ticket.id;

  return query select v_ticket.id, v_ticket.numero, v_ticket.vente_date, v_ticket.total_ttc;
end;
$$;

-- Garde-fou : exactement UNE version de chaque fonction. Sinon la transaction
-- entière est annulée et la base reste dans son état d'avant.
do $$
declare
  v_create integer;
  v_idem integer;
begin
  select count(*) into v_create
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'create_ticket';
  select count(*) into v_idem
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'create_ticket_idempotent';

  if v_create <> 1 or v_idem <> 1 then
    raise exception 'Surcharge inattendue (create_ticket : %, create_ticket_idempotent : %) — migration annulée, rien n''a été modifié', v_create, v_idem;
  end if;
end $$;

commit;
