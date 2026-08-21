<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# camp-app-caisse — consignes de travail

Caisse événementielle de C.A.M.P. France, pour les stands tenus lors
d'événements sportifs (2-3 fois par an, ex. Coupe du monde de Chamonix).
Alex n'est pas développeur : il décrit ce qu'il veut, l'agent écrit le code,
explique ce qu'il fait et pourquoi. Les explications vont à quelqu'un qui
comprend son métier et son outil, pas le jargon technique.

L'application est utilisée en conditions réelles pour de vraies ventes,
avec une obligation de conformité fiscale (voir ISCA plus bas). Ce n'est
pas un prototype : les bugs ont un coût réel, et rien n'est jamais
"juste pour tester" en production.

## Ce qu'est ce projet

- **Next.js App Router + TypeScript + Tailwind**, déployé sur Vercel
  (production : `camp-app-caisse.vercel.app`), déploiement automatique
  depuis la branche `master`.
- **Supabase (Postgres)**, partagé entre production et toutes les branches
  de développement — un changement de schéma doit être additif et
  rétrocompatible, jamais destructif.
- `supabase/schema.sql` est le schéma de référence, mais **n'est jamais
  exécuté automatiquement**. Chaque migration (`supabase/migration_*.sql`)
  a été donnée à Alex à copier-coller dans Supabase → SQL Editor, et il l'a
  exécutée manuellement. Ces fichiers sont un historique de ce qui a déjà
  été appliqué, pas une file d'attente — ne pas les rejouer.
- **PWA installable** sur le téléphone des vendeurs, avec file d'attente
  hors-ligne (`src/lib/offlineQueue.ts`) : un ticket créé sans réseau est
  conservé localement et renvoyé automatiquement à la reconnexion.
- **Trois niveaux d'accès distincts**, à ne pas confondre :
  - vendeur → code d'accès de l'événement (ex. `TEST26`), par téléphone
  - admin appli → mot de passe unique (`ADMIN_PASSWORD`), page `/admin`
  - comptes techniques (GitHub, Vercel, Supabase) → 2FA activée sur les
    trois, sans rapport avec les deux niveaux précédents

## Comment travailler

- **Toujours sur une branche dédiée.** Jamais de push direct sur `master`.
  On fusionne **uniquement** après un « go » explicite d'Alex.
- **Les migrations SQL se donnent à copier-coller.** L'agent n'a pas la clé
  `service_role` en production et ne doit jamais la demander. Toujours
  préciser si la migration est additive et ce qu'elle touche.
- **Ne jamais supprimer de données.** Principe central du projet — une
  correction de ticket annule et recrée plutôt que de modifier, une demande
  de facture s'anonymise plutôt que de se supprimer (la ligne reste, pour
  ne pas fausser les totaux des exports). Le seul cas de suppression réelle
  est le bouton "Vider les données", verrouillé en base au seul événement
  marqué `is_test` — jamais un événement réel.
- **Vérifier avant d'affirmer.** Build + lint avant tout commit. Tester
  réellement (script autonome, appel API direct, page ouverte en preview)
  plutôt que supposer qu'un correctif fonctionne.
- **Signaler ce qui n'a pas pu être vérifié**, plutôt que de laisser croire
  que c'est validé (voir "Limite du service_role local" ci-dessous).
- **Tout en français** : code, commentaires, messages de commit, échanges.
  Les commits décrivent l'intention, pas la mécanique.

## Limite connue : la clé service_role locale est un placeholder

`.env.local` contient une fausse clé `SUPABASE_SERVICE_ROLE_KEY`. Toute
route serveur qui écrit en base échoue donc en local avec une erreur
d'authentification Supabase — ce n'est pas un bug du code. En pratique :

- Le flux vendeur complet (code d'accès → vente → ticket) ne peut pas
  s'exécuter de bout en bout en local.
- Pour vérifier la logique de calcul (exports Excel, totaux, etc.), écrire
  un script autonome avec `npx tsx` qui appelle directement les fonctions
  de `src/lib/` avec des données synthétiques, plutôt que de passer par le
  serveur de dev.
- Pour vérifier un comportement serveur réel, le faire directement contre
  la production après fusion (curl, ou le SQL Editor Supabase), jamais en
  écrivant de fausses données de vente sur un événement réel.

## Pièges déjà rencontrés

**L'ambiguïté de fonction SQL a cassé la production trois fois.**
`create or replace function` ne remplace une fonction que si sa signature
de paramètres est identique. Ajouter ou renommer un paramètre crée une
**nouvelle** surcharge au lieu de remplacer l'ancienne, et PostgREST ne
sait alors plus laquelle choisir (`Could not choose the best candidate
function`). Avant de modifier `create_ticket`, `cancel_ticket`,
`correct_ticket`, `admin_correct_ticket` ou `save_comptage` : vérifier
qu'une seule signature existe en base, et fournir un `drop function`
explicite de l'ancienne si le nombre ou l'ordre des paramètres change.

**Les routes de vente n'étaient pas protégées jusqu'au 28/07/2026.**
Le middleware (`src/middleware.ts`) ne couvre que `/admin/*`. Les routes
`/api/tickets/*` sont protégées par `src/lib/eventAuth.ts`
(`isEventRequestAllowed` / `isTicketRequestAllowed`), qui exige soit le
cookie admin, soit l'en-tête `x-event-code` correspondant au code de
l'événement. Toute nouvelle route qui crée, modifie ou annule un ticket
doit passer par ce même contrôle — les tables `events`/`tickets` ont une
lecture publique en RLS (nécessaire au temps réel côté client), donc rien
d'autre ne protège ces actions.

**Les demandes de facture contiennent des données personnelles.** Table
`demandes_facture`, sans policy de lecture publique (service_role
uniquement). Le champ `anonymise_at` marque l'effacement des coordonnées
après émission de la facture dans l'ERP — déclenché manuellement par Alex,
jamais automatiquement. La ligne reste toujours en base : elle porte le
marqueur "facture demandée" qui exclut la vente du total à traiter en bloc
dans les exports.

**Vider les données de test.** `reset_event_test_data()` doit vider dans
l'ordre les tables qui référencent `tickets` sans cascade (`factures`,
`demandes_facture`) avant `tickets` lui-même, sinon la suppression échoue
sur une violation de clé étrangère. Toute nouvelle table qui référence
`tickets` doit être ajoutée à cette fonction.

**Supabase (forfait gratuit) se met en pause après ~7 jours sans activité
suffisante**, et n'est plus réactivable après 90 jours. Une tâche planifiée
quotidienne (`/api/cron/keepalive`, voir `vercel.json`) interroge la base,
mais **une requête par jour s'est révélée insuffisante** pour éviter
l'avertissement de mise en pause de Supabase. Cette même tâche pingue
aussi le projet Prioris (voir `PRIORIS_SUPABASE_URL` /
`PRIORIS_SUPABASE_ANON_KEY` dans les variables Vercel). Consigne
pratique donnée à Alex : se connecter au tableau de bord Supabase tous
les deux mois pour les deux projets — un projet en pause ne se réveille
que depuis le tableau de bord, jamais en utilisant l'application.

## ISCA (conformité fiscale — art. 286 I 3° bis CGI)

Le système de "clôtures" (`supabase/migration_cloture.sql`) verrouille
définitivement une journée de vente : au-delà, plus aucun ticket ne peut y
être créé, corrigé ou annulé. Chaque clôture porte une empreinte SHA-256
calculée sur l'ensemble des tickets de la période. Ne jamais affaiblir ce
verrou pour "faciliter" une correction — la procédure prévue est de
corriger avant clôture (voir Admin → Corriger un ticket passé).
