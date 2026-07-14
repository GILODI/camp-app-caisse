-- ============================================================================
-- Ajout de la fonctionnalité facture — à coller dans Supabase > SQL Editor
-- et exécuter une fois. Sans risque pour l'existant (aucune table ni
-- fonction existante n'est modifiée).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- facture_counters : compteur atomique de factures, par année civile.
-- Numérotation légale : séquence continue sans trou (obligation de
-- facturation), indépendante des numéros de ticket qui repartent chaque jour.
-- ----------------------------------------------------------------------------
create table if not exists public.facture_counters (
  annee integer primary key,
  last_number integer not null default 0
);

-- ----------------------------------------------------------------------------
-- factures : facture émise à la demande d'un client sur un ticket déjà
-- validé. Le ticket reste la pièce de caisse (obligation logiciel certifié) ;
-- la facture est un document client complémentaire, jamais un substitut.
-- ----------------------------------------------------------------------------
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id),
  event_id uuid not null references public.events(id),
  annee integer not null,
  numero_seq integer not null,
  numero_affiche text not null unique,
  client_nom text not null,
  client_adresse text not null,
  client_siret text,
  client_tva_intraco text,
  taux_tva numeric(5,2) not null default 20.00,
  total_ht numeric(10,2) not null,
  montant_tva numeric(10,2) not null,
  total_ttc numeric(10,2) not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (annee, numero_seq)
);

create index if not exists factures_ticket_idx on public.factures (ticket_id);
create index if not exists factures_event_idx on public.factures (event_id);

-- Attribution atomique du numéro de facture de l'année en cours.
-- Séquence unique, jamais de trou : même une facture annulée garderait son
-- numéro (pas de suppression prévue côté factures).
create or replace function public.next_facture_number(p_annee integer)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into public.facture_counters (annee, last_number)
  values (p_annee, 1)
  on conflict (annee)
  do update set last_number = public.facture_counters.last_number + 1
  returning last_number into v_number;

  return v_number;
end;
$$;

-- Création d'une facture à partir d'un ticket déjà validé. Le total HT et la
-- TVA sont recalculés depuis le total TTC du ticket (prix catalogue déjà TTC).
create or replace function public.create_facture(
  p_ticket_id uuid,
  p_client_nom text,
  p_client_adresse text,
  p_client_siret text,
  p_client_tva_intraco text,
  p_taux_tva numeric,
  p_by text
)
returns public.factures
language plpgsql
as $$
declare
  v_ticket public.tickets;
  v_annee integer := extract(year from (now() at time zone 'Europe/Paris'))::integer;
  v_seq integer;
  v_total_ttc numeric(10,2);
  v_total_ht numeric(10,2);
  v_montant_tva numeric(10,2);
  v_row public.factures;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket introuvable';
  end if;
  if v_ticket.statut <> 'VALIDE' then
    raise exception 'Impossible de facturer un ticket annulé';
  end if;

  v_total_ttc := v_ticket.total_ttc;
  v_total_ht := round(v_total_ttc / (1 + p_taux_tva / 100), 2);
  v_montant_tva := v_total_ttc - v_total_ht;

  v_seq := public.next_facture_number(v_annee);

  insert into public.factures (
    ticket_id, event_id, annee, numero_seq, numero_affiche,
    client_nom, client_adresse, client_siret, client_tva_intraco,
    taux_tva, total_ht, montant_tva, total_ttc, created_by
  )
  values (
    p_ticket_id, v_ticket.event_id, v_annee, v_seq,
    'FACT-' || v_annee || '-' || lpad(v_seq::text, 4, '0'),
    p_client_nom, p_client_adresse, nullif(p_client_siret, ''), nullif(p_client_tva_intraco, ''),
    p_taux_tva, v_total_ht, v_montant_tva, v_total_ttc, p_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- RLS : verrouillée, pas de lecture publique (données client sensibles :
-- nom, adresse, SIRET). Accessible uniquement via service_role, donc
-- uniquement depuis les routes API serveur, jamais depuis le navigateur.
alter table public.factures enable row level security;
alter table public.facture_counters enable row level security;
