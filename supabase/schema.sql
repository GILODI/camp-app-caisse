-- ============================================================================
-- Caisse événementielle C.A.M.P. France — schéma Supabase (Postgres)
-- À exécuter une seule fois dans Supabase > SQL Editor sur le projet dédié.
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- events : un événement (championnat, coupe du monde, festival...).
-- Un seul événement "actif" à la fois pilote l'écran de vente.
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un seul événement actif à la fois.
create unique index if not exists events_single_active_idx
  on public.events ((is_active))
  where is_active;

-- ----------------------------------------------------------------------------
-- vendeurs : liste courte des vendeurs pour un événement (ex. Alex, Collègue).
-- ----------------------------------------------------------------------------
create table if not exists public.vendeurs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, nom)
);

-- ----------------------------------------------------------------------------
-- catalogue_items : produits + prix remisé, importés depuis le Référentiel
-- Stand (xlsx) ou un CSV de secours. Un catalogue par événement.
-- ----------------------------------------------------------------------------
create table if not exists public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reference text not null,
  designation text not null,
  prix_ttc numeric(10,2) not null,
  pvp_ttc numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, reference)
);

create index if not exists catalogue_items_event_idx on public.catalogue_items (event_id);

-- ----------------------------------------------------------------------------
-- ticket_counters : compteur atomique par (événement, jour de vente).
-- Repart implicitement à 1 chaque jour car une nouvelle ligne est créée
-- pour chaque nouvelle date.
-- ----------------------------------------------------------------------------
create table if not exists public.ticket_counters (
  event_id uuid not null references public.events(id) on delete cascade,
  vente_date date not null,
  last_number integer not null default 0,
  primary key (event_id, vente_date)
);

-- ----------------------------------------------------------------------------
-- tickets : un ticket de vente validé (ou annulé).
-- ----------------------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  numero integer not null,
  vente_date date not null,
  vendeur text not null,
  mode_paiement text not null check (mode_paiement in ('CB', 'CB_SANS_CONTACT', 'ESPECES', 'CHEQUE')),
  statut text not null default 'VALIDE' check (statut in ('VALIDE', 'ANNULE')),
  total_ttc numeric(10,2) not null default 0,
  motif_annulation text,
  cancelled_at timestamptz,
  cancelled_by text,
  remplace_ticket_id uuid references public.tickets(id),
  created_at timestamptz not null default now(),
  unique (event_id, vente_date, numero)
);

create index if not exists tickets_event_date_idx on public.tickets (event_id, vente_date);
create index if not exists tickets_statut_idx on public.tickets (statut);

-- ----------------------------------------------------------------------------
-- ticket_items : lignes produit d'un ticket.
-- ----------------------------------------------------------------------------
create table if not exists public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  reference text not null,
  designation text not null,
  prix_unitaire numeric(10,2) not null,
  pvp_ttc numeric(10,2),
  quantite integer not null check (quantite > 0),
  total_ligne numeric(10,2) generated always as (prix_unitaire * quantite) stored,
  created_at timestamptz not null default now()
);

create index if not exists ticket_items_ticket_idx on public.ticket_items (ticket_id);

-- ============================================================================
-- Fonctions RPC — numérotation atomique + création/annulation/correction.
-- Appelées côté serveur (route API Next.js) avec la clé service_role.
-- ============================================================================

-- Attribution atomique du numéro de ticket du jour pour un événement.
-- L'upsert sur ticket_counters verrouille la ligne concernée : deux appels
-- concurrents ne peuvent jamais recevoir le même numéro.
create or replace function public.next_ticket_number(p_event_id uuid, p_vente_date date)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into public.ticket_counters (event_id, vente_date, last_number)
  values (p_event_id, p_vente_date, 1)
  on conflict (event_id, vente_date)
  do update set last_number = public.ticket_counters.last_number + 1
  returning last_number into v_number;

  return v_number;
end;
$$;

-- Création d'un ticket + ses lignes, en une transaction, avec numéro atomique.
-- p_items : jsonb array de { reference, designation, prix_unitaire, quantite }
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

  select coalesce(sum((elem->>'prix_unitaire')::numeric * (elem->>'quantite')::integer), 0)
    into v_total
    from jsonb_array_elements(p_items) as elem;

  v_numero := public.next_ticket_number(p_event_id, v_vente_date);

  insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc, remplace_ticket_id)
  values (p_event_id, v_numero, v_vente_date, p_vendeur, p_mode_paiement, v_total, p_remplace_ticket_id)
  returning tickets.id into v_ticket_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.ticket_items (ticket_id, reference, designation, prix_unitaire, pvp_ttc, quantite)
    values (
      v_ticket_id,
      v_item->>'reference',
      v_item->>'designation',
      (v_item->>'prix_unitaire')::numeric,
      nullif(v_item->>'pvp_ttc', '')::numeric,
      (v_item->>'quantite')::integer
    );
  end loop;

  return query select v_ticket_id, v_numero, v_vente_date, v_total;
end;
$$;

-- Annulation d'un ticket (trace conservée, jamais de suppression).
create or replace function public.cancel_ticket(
  p_ticket_id uuid,
  p_motif text,
  p_by text
)
returns void
language plpgsql
as $$
begin
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

-- Correction : annule l'original et crée un nouveau ticket lié, en une
-- transaction (jamais d'état intermédiaire incohérent).
create or replace function public.correct_ticket(
  p_ticket_id uuid,
  p_event_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb,
  p_by text
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
as $$
begin
  perform public.cancel_ticket(p_ticket_id, 'Correction', p_by);

  return query
    select * from public.create_ticket(p_event_id, p_vendeur, p_mode_paiement, p_items, p_ticket_id);
end;
$$;

-- ============================================================================
-- Row Level Security — lecture publique (nécessaire pour Realtime côté
-- vendeurs), écriture uniquement via la clé service_role (routes API
-- serveur), jamais depuis le navigateur.
-- ============================================================================

alter table public.events enable row level security;
alter table public.vendeurs enable row level security;
alter table public.catalogue_items enable row level security;
alter table public.ticket_counters enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;

drop policy if exists "lecture publique events" on public.events;
create policy "lecture publique events" on public.events for select using (true);

drop policy if exists "lecture publique vendeurs" on public.vendeurs;
create policy "lecture publique vendeurs" on public.vendeurs for select using (true);

drop policy if exists "lecture publique catalogue" on public.catalogue_items;
create policy "lecture publique catalogue" on public.catalogue_items for select using (true);

drop policy if exists "lecture publique tickets" on public.tickets;
create policy "lecture publique tickets" on public.tickets for select using (true);

drop policy if exists "lecture publique ticket_items" on public.ticket_items;
create policy "lecture publique ticket_items" on public.ticket_items for select using (true);

-- ticket_counters n'a pas besoin d'être lisible côté client : aucune policy.

-- ============================================================================
-- Realtime — la liste des ventes du jour se met à jour instantanément.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_items'
  ) then
    alter publication supabase_realtime add table public.ticket_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendeurs'
  ) then
    alter publication supabase_realtime add table public.vendeurs;
  end if;
end $$;
