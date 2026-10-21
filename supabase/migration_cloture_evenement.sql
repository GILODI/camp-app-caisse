-- ============================================================================
-- Une clôture d'ÉVÉNEMENT fige réellement l'événement.
--
-- Le défaut : close_event fige le nombre de tickets et une empreinte, mais
-- create_ticket ne contrôlait que les clôtures de JOUR. Une fois l'événement
-- clôturé, une vente datée d'un jour sans clôture était donc encore acceptée :
-- la base contenait alors plus de tickets que la clôture n'en avait comptés, et
-- l'empreinte de contrôle ne correspondait plus aux données.
--
-- La correction : create_ticket et cancel_ticket refusent tout, sur tout jour,
-- dès qu'une clôture d'événement existe.
--   - create_ticket couvre la création et correct_ticket (qui l'appelle).
--   - cancel_ticket couvre l'annulation et admin_correct_ticket, qui l'appelle
--     avant d'insérer — c'est ce qui la protège, elle n'a besoin d'aucun
--     changement.
--
-- Rien n'est supprimé ni modifié dans les données. Aucune signature ne change :
-- « create or replace » remplace les fonctions en place, il ne peut donc pas
-- apparaître de version en double (« Could not choose the best candidate
-- function »). Un contrôle final le vérifie quand même et annule tout sinon.
--
-- Sans effet sur les ventes en cours : un événement non clôturé se comporte
-- exactement comme avant. Les renvois de ventes déjà acceptées restent
-- inoffensifs (create_ticket_idempotent les retrouve avant d'appeler
-- create_ticket).
--
-- À coller dans Supabase > SQL Editor et exécuter une fois, EN ENTIER.
-- ============================================================================

begin;

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

  -- Événement clôturé : plus aucun ticket, sur aucun jour.
  if exists (
    select 1 from public.clotures
    where event_id = p_event_id and type = 'evenement'
  ) then
    raise exception 'Événement déjà clôturé : impossible d''ajouter ou de corriger un ticket';
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

create or replace function public.cancel_ticket(
  p_ticket_id uuid,
  p_motif text,
  p_by text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Événement clôturé : plus aucune annulation. Couvre aussi
  -- admin_correct_ticket, qui passe par ici avant de réinsérer.
  if exists (
    select 1 from public.tickets t
    join public.clotures c
      on c.event_id = t.event_id and c.type = 'evenement'
    where t.id = p_ticket_id
  ) then
    raise exception 'Événement déjà clôturé : impossible d''annuler ce ticket';
  end if;

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

-- Garde-fou : exactement UNE version de chaque fonction modifiée. Sinon la
-- transaction entière est annulée et la base reste dans son état d'avant.
do $$
declare
  v_create integer;
  v_cancel integer;
begin
  select count(*) into v_create
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'create_ticket';
  select count(*) into v_cancel
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'cancel_ticket';

  if v_create <> 1 or v_cancel <> 1 then
    raise exception 'Surcharge inattendue (create_ticket : %, cancel_ticket : %) — migration annulée, rien n''a été modifié', v_create, v_cancel;
  end if;
end $$;

commit;
