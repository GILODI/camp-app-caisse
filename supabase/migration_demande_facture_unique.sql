-- ============================================================================
-- Une seule demande de facture par ticket.
-- Sans cette contrainte, un double-clic (ou une ressaisie depuis "Ventes du
-- jour") peut créer deux demandes pour la même vente, donc deux lignes dans
-- l'export Excel et un risque de facturer deux fois le même client.
--
-- L'index posé initialement n'était pas unique : il faut donc le remplacer,
-- "create unique index if not exists" ne le convertirait pas.
-- À coller dans Supabase > SQL Editor et exécuter une fois.
--
-- Aucune donnée n'est supprimée. Si des doublons existaient déjà, la création
-- de l'index échouerait avec un message explicite — dans ce cas, me le
-- signaler pour arbitrer quelle demande garder (rien ne sera perdu).
-- ============================================================================

drop index if exists public.demandes_facture_ticket_idx;

create unique index if not exists demandes_facture_ticket_idx
  on public.demandes_facture (ticket_id);
