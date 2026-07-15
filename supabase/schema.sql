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
  -- Code donné aux vendeurs pour accéder aux écrans de vente de CET
  -- événement (voir EventCodeGate côté app) ; jamais exposé aux hooks
  -- publics, uniquement lu côté serveur ou depuis l'espace Admin protégé.
  code_acces text,
  -- Événement de test (ex. "Event test") : seul cas où le bouton "Vider
  -- les données" (reset_event_test_data) est autorisé. Faux par défaut —
  -- un événement réel ne doit jamais pouvoir être vidé, ses transactions
  -- doivent rester intégralement conservées (traçabilité comptable).
  is_test boolean not null default false,
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
  -- quantité initiale en stock (bon de commande) ; null = produit non suivi.
  stock_initial integer,
  -- code-barres EAN/UPC, pour l'ajout au ticket par scan caméra.
  code_barre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, reference)
);

create index if not exists catalogue_items_event_idx on public.catalogue_items (event_id);
create index if not exists catalogue_items_barcode_idx on public.catalogue_items (event_id, code_barre);

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
  -- true si le vendeur a modifié le prix à la main au moment de la vente
  -- (remise ponctuelle produit d'expo, emballage abîmé…). Colorié à l'export.
  prix_modifie boolean not null default false,
  quantite integer not null check (quantite > 0),
  total_ligne numeric(10,2) generated always as (prix_unitaire * quantite) stored,
  created_at timestamptz not null default now()
);

create index if not exists ticket_items_ticket_idx on public.ticket_items (ticket_id);

-- ----------------------------------------------------------------------------
-- mouvements_stock : sorties de stock hors vente (vol, dotation athlète,
-- casse). Décrémentent le stock restant sans compter comme chiffre d'affaires.
-- ----------------------------------------------------------------------------
create table if not exists public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reference text not null,
  designation text not null,
  type text not null check (type in ('VOL', 'DOTATION', 'CASSE')),
  quantite integer not null check (quantite > 0),
  motif text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists mouvements_stock_event_idx on public.mouvements_stock (event_id);

-- ----------------------------------------------------------------------------
-- caisse_comptages : comptage physique de la caisse espèces (billets/pièces),
-- pour vérifier chaque soir que le compte correspond aux ventes espèces
-- enregistrées. Un comptage "initial" (fond de caisse avant l'événement) et
-- un comptage "jour" par date réelle (pas de position figée Jour 1/2/3, ça
-- marche pour un événement de n'importe quelle durée).
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_comptages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in ('initial', 'jour')),
  comptage_date date, -- null pour "initial", requis pour "jour"
  nb_billets_50 integer not null default 0,
  nb_billets_20 integer not null default 0,
  nb_billets_10 integer not null default 0,
  nb_billets_5 integer not null default 0,
  nb_pieces_2 integer not null default 0,
  nb_pieces_1 integer not null default 0,
  nb_pieces_050 integer not null default 0,
  nb_pieces_020 integer not null default 0,
  nb_pieces_010 integer not null default 0,
  nb_pieces_005 integer not null default 0,
  total_compte numeric(10,2) generated always as (
    nb_billets_50 * 50 + nb_billets_20 * 20 + nb_billets_10 * 10 + nb_billets_5 * 5 +
    nb_pieces_2 * 2 + nb_pieces_1 * 1 + nb_pieces_050 * 0.5 + nb_pieces_020 * 0.2 +
    nb_pieces_010 * 0.1 + nb_pieces_005 * 0.05
  ) stored,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un seul comptage "initial" par événement...
create unique index if not exists caisse_comptages_initial_idx
  on public.caisse_comptages (event_id)
  where type = 'initial';

-- ...et un seul comptage "jour" par événement et par date.
create unique index if not exists caisse_comptages_jour_idx
  on public.caisse_comptages (event_id, comptage_date)
  where type = 'jour';

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

-- ----------------------------------------------------------------------------
-- clotures : verrouillage périodique (archivage ISCA). Une clôture "jour"
-- fige et empreinte-numérote (hash) l'ensemble des tickets d'une date de
-- vente ; une fois posée, plus aucune création/annulation de ticket n'est
-- possible sur cette date (voir create_ticket / cancel_ticket). Une clôture
-- "evenement" fige l'ensemble de l'événement, une fois tous ses jours de
-- vente déjà clôturés individuellement — c'est l'équivalent, pour un usage
-- événementiel ponctuel (2-3 fois par an), du couple mensuel/annuel prévu
-- par la réglementation pour un usage de vente continue.
-- ----------------------------------------------------------------------------
create table if not exists public.clotures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in ('jour', 'evenement')),
  periode date, -- date clôturée pour type='jour' ; null pour type='evenement'
  nb_tickets integer not null,
  total_ttc numeric(10,2) not null,
  -- Empreinte de contrôle (SHA-256) calculée sur l'ensemble des tickets de
  -- la période (numéro, montant, statut) — toute modification a posteriori
  -- des données sous-jacentes rendrait cette empreinte invérifiable.
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
-- p_items : jsonb array de { reference, designation, prix_unitaire, pvp_ttc,
--           prix_modifie, quantite } (prix_modifie/pvp_ttc optionnels)
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

-- Enregistre (ou met à jour si déjà saisi) un comptage de caisse espèces.
-- Un seul comptage "initial" par événement, un seul comptage "jour" par date.
create or replace function public.save_comptage(
  p_event_id uuid,
  p_type text,
  p_comptage_date date,
  p_nb_billets_50 integer,
  p_nb_billets_20 integer,
  p_nb_billets_10 integer,
  p_nb_billets_5 integer,
  p_nb_pieces_2 integer,
  p_nb_pieces_1 integer,
  p_nb_pieces_050 integer,
  p_nb_pieces_020 integer,
  p_nb_pieces_010 integer,
  p_nb_pieces_005 integer,
  p_by text
)
returns public.caisse_comptages
language plpgsql
as $$
declare
  v_row public.caisse_comptages;
begin
  if p_type = 'initial' then
    insert into public.caisse_comptages (
      event_id, type, comptage_date, nb_billets_50, nb_billets_20, nb_billets_10, nb_billets_5,
      nb_pieces_2, nb_pieces_1, nb_pieces_050, nb_pieces_020, nb_pieces_010, nb_pieces_005, created_by
    )
    values (
      p_event_id, 'initial', null, p_nb_billets_50, p_nb_billets_20, p_nb_billets_10, p_nb_billets_5,
      p_nb_pieces_2, p_nb_pieces_1, p_nb_pieces_050, p_nb_pieces_020, p_nb_pieces_010, p_nb_pieces_005, p_by
    )
    on conflict (event_id) where type = 'initial'
    do update set
      nb_billets_50 = excluded.nb_billets_50,
      nb_billets_20 = excluded.nb_billets_20,
      nb_billets_10 = excluded.nb_billets_10,
      nb_billets_5 = excluded.nb_billets_5,
      nb_pieces_2 = excluded.nb_pieces_2,
      nb_pieces_1 = excluded.nb_pieces_1,
      nb_pieces_050 = excluded.nb_pieces_050,
      nb_pieces_020 = excluded.nb_pieces_020,
      nb_pieces_010 = excluded.nb_pieces_010,
      nb_pieces_005 = excluded.nb_pieces_005,
      created_by = excluded.created_by,
      updated_at = now()
    returning * into v_row;
  else
    if p_comptage_date is null then
      raise exception 'comptage_date requis pour un comptage de type jour';
    end if;

    insert into public.caisse_comptages (
      event_id, type, comptage_date, nb_billets_50, nb_billets_20, nb_billets_10, nb_billets_5,
      nb_pieces_2, nb_pieces_1, nb_pieces_050, nb_pieces_020, nb_pieces_010, nb_pieces_005, created_by
    )
    values (
      p_event_id, 'jour', p_comptage_date, p_nb_billets_50, p_nb_billets_20, p_nb_billets_10, p_nb_billets_5,
      p_nb_pieces_2, p_nb_pieces_1, p_nb_pieces_050, p_nb_pieces_020, p_nb_pieces_010, p_nb_pieces_005, p_by
    )
    on conflict (event_id, comptage_date) where type = 'jour'
    do update set
      nb_billets_50 = excluded.nb_billets_50,
      nb_billets_20 = excluded.nb_billets_20,
      nb_billets_10 = excluded.nb_billets_10,
      nb_billets_5 = excluded.nb_billets_5,
      nb_pieces_2 = excluded.nb_pieces_2,
      nb_pieces_1 = excluded.nb_pieces_1,
      nb_pieces_050 = excluded.nb_pieces_050,
      nb_pieces_020 = excluded.nb_pieces_020,
      nb_pieces_010 = excluded.nb_pieces_010,
      nb_pieces_005 = excluded.nb_pieces_005,
      created_by = excluded.created_by,
      updated_at = now()
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- Vide les données de vente d'un événement (tickets, factures, mouvements,
-- comptages caisse) pour repartir d'une base propre — utile pour un
-- événement de test réutilisé souvent. Ne touche jamais au catalogue
-- (produits réutilisables) ni à facture_counters (séquence légale globale
-- des numéros de facture, partagée entre tous les événements : ne doit
-- jamais être réinitialisée, même pour un événement de test).
-- Garde-fou au niveau base de données (pas seulement côté interface) :
-- refuse tout événement dont is_test n'est pas explicitement vrai — un
-- événement réel ne doit jamais pouvoir être vidé, même par erreur ou par
-- un appel direct à l'API.
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

-- Clôture d'une journée de vente : fige le nombre de tickets, le total TTC
-- et une empreinte de contrôle (SHA-256) de tous les tickets de cette date
-- (validés et annulés, pour un historique complet vérifiable). Une fois
-- posée, plus aucun ticket ne peut être créé, corrigé ou annulé sur cette
-- date (voir create_ticket / cancel_ticket).
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

-- Clôture de l'événement entier : n'est possible qu'une fois tous les jours
-- de vente ayant des tickets déjà clôturés individuellement (sinon des
-- données resteraient modifiables sous couvert d'une clôture d'ensemble qui
-- les laisserait croire figées). Fige le total et une empreinte de
-- contrôle sur l'ensemble des tickets de l'événement.
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
alter table public.caisse_comptages enable row level security;
alter table public.mouvements_stock enable row level security;
alter table public.factures enable row level security;
alter table public.facture_counters enable row level security;
alter table public.clotures enable row level security;
-- factures / facture_counters : pas de policy de lecture publique — données
-- client (nom, adresse, SIRET) accessibles uniquement via service_role
-- (routes API serveur), jamais depuis le navigateur.

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

drop policy if exists "lecture publique caisse_comptages" on public.caisse_comptages;
create policy "lecture publique caisse_comptages" on public.caisse_comptages for select using (true);

drop policy if exists "lecture publique mouvements_stock" on public.mouvements_stock;
create policy "lecture publique mouvements_stock" on public.mouvements_stock for select using (true);

drop policy if exists "lecture publique clotures" on public.clotures;
create policy "lecture publique clotures" on public.clotures for select using (true);

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

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mouvements_stock'
  ) then
    alter publication supabase_realtime add table public.mouvements_stock;
  end if;
end $$;
