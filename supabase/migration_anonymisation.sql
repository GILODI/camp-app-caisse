-- ============================================================================
-- Anonymisation des coordonnées client après émission de la facture (RGPD).
--
-- Une fois la facture établie dans l'ERP, le client y existe comme tous les
-- autres : l'appli n'a plus aucune raison de conserver son nom, son adresse,
-- son téléphone ou son email.
--
-- On EFFACE LES COORDONNÉES mais on CONSERVE LA LIGNE. C'est elle qui porte
-- le marqueur « facture demandée », lequel sort la vente du total à traiter
-- en bloc dans les exports. Supprimer la ligne ferait réapparaître ces
-- ventes dans le bloc : une archive régénérée plus tard ne correspondrait
-- plus à ce qui a réellement été déclaré à la comptabilité.
--
-- À coller dans Supabase > SQL Editor et exécuter une fois. Additive :
-- ajoute une colonne, ne modifie ni ne supprime aucune donnée existante.
-- ============================================================================

alter table public.demandes_facture
  add column if not exists anonymise_at timestamptz;

comment on column public.demandes_facture.anonymise_at is
  'Date d''effacement des coordonnées client (RGPD). Null = coordonnées encore présentes.';
