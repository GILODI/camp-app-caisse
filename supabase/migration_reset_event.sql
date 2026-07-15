-- ============================================================================
-- Ajout du bouton "Vider les données" — à coller dans Supabase > SQL Editor
-- et exécuter une fois. Additive : ajoute une colonne (avec valeur par
-- défaut) et une fonction, ne modifie aucune donnée existante hormis le
-- marquage explicite de "Event test" ci-dessous.
-- ============================================================================

-- Marqueur "événement de test" : faux par défaut pour tout événement
-- existant ou futur. Seul un événement marqué is_test = true peut être vidé
-- via reset_event_test_data — un événement réel garde toutes ses
-- transactions pour toujours (traçabilité comptable).
alter table public.events add column if not exists is_test boolean not null default false;

-- Vide les données de vente d'un événement (tickets, factures, mouvements,
-- comptages caisse) pour repartir d'une base propre — utile pour un
-- événement de test réutilisé souvent. Ne touche jamais au catalogue
-- (produits réutilisables) ni à facture_counters (séquence légale globale
-- des numéros de facture, partagée entre tous les événements : ne doit
-- jamais être réinitialisée, même pour un événement de test).
-- Garde-fou au niveau base de données (pas seulement côté interface) :
-- refuse tout événement dont is_test n'est pas explicitement vrai.
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
end;
$$;

-- Marque l'événement "Event test" existant comme événement de test (à
-- adapter si son nom diffère chez toi). Sans effet sur les autres
-- événements, qui restent is_test = false par défaut.
update public.events set is_test = true where nom = 'Event test';
