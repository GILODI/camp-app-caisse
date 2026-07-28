-- ============================================================================
-- Ajoute l'email du client aux demandes de facture (nécessaire pour pouvoir
-- lui envoyer la facture une fois établie dans le système comptable).
-- À coller dans Supabase > SQL Editor et exécuter une fois. Additive :
-- ajoute juste une colonne, ne modifie ni ne supprime rien d'existant.
-- ============================================================================

alter table public.demandes_facture add column if not exists client_email text not null default '';
