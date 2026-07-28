-- ============================================================================
-- Corrige « Vider les données » sur un événement de test.
--
-- La table demandes_facture (ajoutée récemment) référence tickets sans
-- « on delete cascade » : la fonction de vidage ne la nettoyait pas, donc la
-- suppression des tickets échouait sur une violation de clé étrangère dès
-- qu'une demande de facture existait sur l'événement de test.
--
-- Remplace la fonction à l'identique, avec la seule ligne manquante. Les
-- garde-fous sont inchangés : refus si l'événement n'est pas marqué comme
-- événement de test, catalogue et séquence de factures jamais touchés.
-- À coller dans Supabase > SQL Editor et exécuter une fois.
-- ============================================================================

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

  -- factures et demandes_facture référencent tickets sans cascade : elles
  -- doivent être vidées AVANT, sinon la suppression des tickets échoue.
  delete from public.factures where event_id = p_event_id;
  delete from public.demandes_facture where event_id = p_event_id;
  delete from public.tickets where event_id = p_event_id;
  delete from public.mouvements_stock where event_id = p_event_id;
  delete from public.caisse_comptages where event_id = p_event_id;
  delete from public.ticket_counters where event_id = p_event_id;
  delete from public.clotures where event_id = p_event_id;
end;
$$;
