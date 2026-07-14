-- ============================================================================
-- Ajout du bouton "Vider les données" — à coller dans Supabase > SQL Editor
-- et exécuter une fois. Sans risque pour l'existant (ajoute une fonction,
-- ne modifie aucune table).
-- ============================================================================

-- Vide les données de vente d'un événement (tickets, factures, mouvements,
-- comptages caisse) pour repartir d'une base propre — utile pour un
-- événement de test réutilisé souvent. Ne touche jamais au catalogue
-- (produits réutilisables) ni à facture_counters (séquence légale globale
-- des numéros de facture, partagée entre tous les événements : ne doit
-- jamais être réinitialisée, même pour un événement de test).
create or replace function public.reset_event_test_data(p_event_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.factures where event_id = p_event_id;
  delete from public.tickets where event_id = p_event_id;
  delete from public.mouvements_stock where event_id = p_event_id;
  delete from public.caisse_comptages where event_id = p_event_id;
  delete from public.ticket_counters where event_id = p_event_id;
end;
$$;
