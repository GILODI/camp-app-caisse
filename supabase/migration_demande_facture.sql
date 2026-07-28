-- ============================================================================
-- Remplace la génération de facture par une simple "demande de facture"
-- (décision de l'expert-comptable : la vraie facture est ressaisie
-- individuellement dans le système comptable, pas générée par l'appli).
-- À coller dans Supabase > SQL Editor et exécuter une fois. Additive :
-- ajoute une table, ne modifie ni ne supprime rien d'existant (la table
-- "factures" de l'ancien mécanisme reste en base, simplement plus utilisée).
-- ============================================================================

create table if not exists public.demandes_facture (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id),
  event_id uuid not null references public.events(id),
  client_nom text not null,
  client_prenom text not null,
  client_adresse text not null,
  client_telephone text not null,
  client_siret text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists demandes_facture_ticket_idx on public.demandes_facture (ticket_id);
create index if not exists demandes_facture_event_idx on public.demandes_facture (event_id);

alter table public.demandes_facture enable row level security;
-- Pas de policy de lecture publique — données client (nom, adresse,
-- téléphone, SIRET) accessibles uniquement via service_role (routes API
-- serveur), jamais depuis le navigateur.
