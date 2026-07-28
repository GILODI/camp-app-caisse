-- ============================================================================
-- Durcissement des fonctions SQL — fait tomber à zéro les avertissements du
-- Security Advisor de Supabase. Aucune donnée touchée, aucun changement de
-- comportement de l'application.
--
-- À coller dans Supabase > SQL Editor et exécuter une fois, en entier.
--
-- Trois parties :
--   1. supprime une surcharge obsolète d'admin_correct_ticket ;
--   2. supprime une surcharge obsolète de save_comptage ;
--   3. fige le search_path de toutes les fonctions du schéma public.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Surcharge obsolète d'admin_correct_ticket
--
-- Deux versions coexistent en base : une ancienne, jamais appelée par
-- l'application (aucune référence dans le code), et celle utilisée par la
-- page « Corriger un ticket passé ». Ce n'est pas cassé aujourd'hui — leurs
-- paramètres portent des noms différents, donc l'API choisit correctement —
-- mais c'est la configuration exacte qui a provoqué les pannes
-- « Could not choose the best candidate function ». On retire la morte.
--
--   À SUPPRIMER : (p_ticket_id, p_mode_paiement, p_items, p_by, p_motif)
--   À CONSERVER : (p_ticket_id, p_vendeur, p_mode_paiement, p_items, p_by)
--
-- Les types diffèrent dans l'ordre, la cible est donc sans ambiguïté.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_correct_ticket(uuid, text, jsonb, text, text);


-- ----------------------------------------------------------------------------
-- 2. Surcharge obsolète de save_comptage
--
-- Même situation. La version utilisée par l'application prend 14 paramètres
-- (event, type, date, 4 coupures de billets, 6 de pièces, auteur).
-- Le bloc s'interrompt sans rien supprimer s'il ne la retrouve pas — on ne
-- supprime jamais à l'aveugle.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_attendue integer;
begin
  select count(*) into v_attendue
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_comptage' and p.pronargs = 14;

  if v_attendue <> 1 then
    raise exception 'save_comptage à 14 paramètres introuvable (trouvé : %) — abandon, rien supprimé', v_attendue;
  end if;

  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_comptage' and p.pronargs <> 14
  loop
    raise notice 'Suppression de la surcharge obsolète : %', r.signature;
    execute 'drop function ' || r.signature::text;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 3. search_path figé
--
-- Sans cela, une fonction résout les tables via le search_path de l'appelant.
-- Nos fonctions ne sont pas SECURITY DEFINER, le risque réel est donc faible,
-- mais le figer supprime toute ambiguïté de résolution et satisfait le
-- Security Advisor.
--
-- Ne touche que les fonctions qui n'en ont pas déjà un — les fonctions gérées
-- par Supabase (rls_auto_enable) sont donc laissées telles quelles.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and (
         p.proconfig is null
         or not exists (
           select 1 from unnest(p.proconfig) as c where c like 'search_path=%'
         )
       )
  loop
    raise notice 'search_path figé sur : %', r.signature;
    execute format('alter function %s set search_path = public, pg_temp', r.signature);
  end loop;
end $$;
