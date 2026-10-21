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
- Pour vérifier la logique de calcul ou le SQL, ne pas passer par le serveur
  de dev : écrire ou compléter un test (voir « Tests automatiques » ci-dessous).
- Pour vérifier un comportement serveur réel, le faire directement contre
  la production après fusion (curl, ou le SQL Editor Supabase), jamais en
  écrivant de fausses données de vente sur un événement réel — uniquement
  sur l'événement marqué `is_test` (« Event test »), avec l'accord d'Alex.

## Tests automatiques

`npm test` (Vitest) lance toute la suite en quelques secondes, **sans réseau
et sans toucher à la production**. **À lancer avant chaque fusion**, avec
`npm run build` et `npm run lint`. Pas de test qui échoue « parce qu'on verra
plus tard » : soit on corrige, soit on documente le défaut (voir `it.fails`).

- `tests/sql/*.test.ts` : les VRAIES fonctions SQL, exécutées dans un vrai
  Postgres en mémoire (`@electric-sql/pglite`) qui charge le `supabase/schema.sql`
  complet. Création idempotente, date de vente, clôtures, vidage des données de
  test, et garde-fous généraux : aucune fonction en plusieurs versions, tous les
  `search_path` figés. `tests/helpers/db.ts` fournit les outils communs.
- `src/lib/offlineQueue.test.ts` : la file d'attente du téléphone (renvois,
  référence et heure de vente stables, refus temporaires).
- `src/app/api/tickets/route.test.ts` : validation et chaîne de repli de la
  route de vente — notamment qu'aucune erreur autre que « fonction absente » ne
  déclenche de nouvelle tentative (risque de double création).
- `src/lib/excelExport.test.ts`, `caisseCalc.test.ts`, `stock.test.ts` : les
  calculs qui alimentent la comptabilité.

**Ce que ces tests ne couvrent pas :** les écrans (aucun test d'interface), une
vraie coupure réseau sur un vrai téléphone, et deux requêtes réellement
simultanées (Postgres en mémoire = une seule connexion ; le verrou
`pg_advisory_xact_lock` de `create_ticket_idempotent` repose sur le
comportement documenté de Postgres).

**Quand on change `supabase/schema.sql`**, rien d'autre à faire : les tests
rechargent le fichier. Mais une migration à exécuter en production doit aussi
être reportée dans `schema.sql`, sinon les tests valident un schéma différent
de la production.

**Vérifier qu'un test protège vraiment :** casser volontairement le code à
protéger (retirer une condition, inverser un signe) et constater que le test
échoue. Un test jamais vu échouer ne prouve rien. Le 19/10/2026, 17 défauts
volontaires sur 17 ont été détectés ainsi.

**`tests/sql/migration-cloture-evenement.test.ts` est un test de transition :**
il rejoue la migration sur le `schema.sql` de `master` (l'état de production).
Une fois la migration exécutée et fusionnée, `master` porte déjà le correctif :
le test « avant migration » s'affiche alors comme ignoré. Supprimer ce fichier à
ce moment-là — `tests/sql/cloture.test.ts` protège le comportement durablement.

## Dépendances et sécurité des paquets

`next` et `eslint-config-next` sont **épinglés à une version exacte** (sans `^`)
et doivent rester **à la même version**. `npm install next@X` réécrit l'épinglage
en plage : utiliser `npm install --save-exact next@X eslint-config-next@X`.

**Après toute mise à jour de `next`**, ne pas se contenter du build : il ne prouve
pas que `@react-pdf/renderer` (reçus) et `exceljs` (exports) fonctionnent encore
une fois empaquetés. Vérifier sur le build de production (`npm run build` puis
`npx next start`) à l'aide d'une route temporaire, jamais commitée, qui appelle
`renderTicketPdf` et `generateDailyExport` avec des données fictives ; contrôler
aussi que `/admin/*` redirige toujours vers la connexion (le middleware est la
seule protection des pages admin) et que les routes `/api/*` sensibles
répondent 401 sans authentification.

`npm audit --omit=dev` : le 21/10/2026, `next` 16.2.10 → 16.4.2 a fait passer les
vulnérabilités de production de 7 (dont 1 critique) à 4 (aucune critique).
Reste, analysé et volontairement laissé :
- `exceljs` / `uuid` : le correctif proposé par npm est un **retour à exceljs
  3.4.0** (une régression). `exceljs` n'appelle `uuid` que par `v4()` sans tampon,
  alors que l'avis vise v3/v5/v6 avec un tampon fourni.
- `brace-expansion` : tiré par `glob` via `exceljs` → `archiver`, sans motif
  contrôlé par un utilisateur.
- `baseline-browser-mapping` : dépendance de `next` utilisée à la construction.
À réévaluer à chaque mise à jour d'`exceljs`.

Le fichier `src/middleware.ts` est signalé obsolète par Next.js (convention
renommée `proxy`). Sans conséquence aujourd'hui ; migration automatique possible
avec `npx @next/codemod@canary middleware-to-proxy .` — à faire sur une branche,
puis revérifier la protection de `/admin/*` comme ci-dessus.

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

**La création de ticket est idempotente.** `/api/tickets` appelle
`create_ticket_idempotent` (et non `create_ticket` directement) avec un
`client_ref` généré par le téléphone avant le premier envoi
(`src/lib/offlineQueue.ts`). Sans cela, une confirmation perdue en route
faisait renvoyer la vente par la file d'attente hors-ligne, et le serveur
créait un second ticket : chiffre d'affaires et stock comptés deux fois,
sans que personne le voie. À ne pas casser :
- le `client_ref` doit être fixé **avant** le premier envoi puis conservé
  tel quel à chaque renvoi ;
- `create_ticket_idempotent` enveloppe `create_ticket` sans en modifier la
  signature — ne jamais changer celle de `create_ticket`, voir plus haut ;
- les corrections (`correct_ticket`) ne passent pas par ce chemin : elles ne
  sont pas mises en file, une erreur s'affiche directement au vendeur.
Sa logique SQL a été vérifiée sur un vrai moteur Postgres (pglite, en
mémoire) : un renvoi retrouve le ticket existant, y compris après clôture de
la journée ; l'index unique `tickets_client_ref_idx` fait office de filet.

**Ordre de déploiement quand le code dépend d'une nouvelle fonction SQL :**
exécuter la migration **avant** de fusionner (une migration additive est sans
risque pour l'ancien code), puis fusionner. La route `/api/tickets` retombe
sur `create_ticket` si `create_ticket_idempotent` est introuvable (erreur
PostgREST `PGRST202`) pour ne pas arrêter les ventes — mais sans protection
contre les doublons, d'où un `console.warn` dans les journaux Vercel.

**La date d'un ticket est celle de la vente, pas celle de la transmission.**
Le téléphone envoie `vendu_le` (heure de validation, fixée avant le premier
envoi comme `client_ref` et jamais refaite au renvoi) ; `create_ticket` en
déduit `vente_date` (fuseau Europe/Paris). `tickets.created_at` reste l'heure
d'enregistrement par le serveur — ne pas confondre : l'affichage et le reçu PDF
utilisent `vendu_le ?? created_at`. Deux garde-fous dans `create_ticket` :
- `vendu_le` n'est retenu que s'il date de moins de 48 h et n'est pas dans le
  futur (5 min de tolérance) ; sinon il est ignoré et la vente prend la date du
  jour. L'horloge d'un téléphone n'est pas fiable.
- si la journée de la vente est **déjà clôturée**, elle n'est jamais rouverte :
  la vente est enregistrée à la date du jour et `vendu_le` garde l'heure réelle
  (l'écart `date(vendu_le) ≠ vente_date` est la trace). Choix délibéré : refuser
  la vente la perdrait alors que l'argent est encaissé.
Conséquence d'exploitation : une vente tardive peut apparaître sur une journée
déjà exportée. Avant de clôturer, vérifier qu'aucun téléphone n'a de vente en
attente, et ré-exporter si une vente est arrivée après l'export.

**Limite connue de la file hors-ligne, non corrigée :** toute erreur renvoyée
par le serveur (HTTP 500), y compris une erreur métier comme une journée
clôturée, est traitée comme une panne réseau : la vente est renvoyée
indéfiniment sans que le vendeur en voie la cause.

**Changer la signature de `create_ticket` ou `create_ticket_idempotent` :**
voir `supabase/migration_vente_date_reelle.sql` pour le modèle à suivre — suppression
explicite des anciennes signatures dans la même transaction, puis contrôle final
qui annule tout s'il reste plus d'une version.

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

**La clôture d'ÉVÉNEMENT fige tout l'événement, sur tous les jours.** Avant
`migration_cloture_evenement.sql`, `create_ticket` ne contrôlait que les
clôtures de jour : une vente datée d'un jour sans clôture était acceptée après
`close_event`, et le nombre de tickets figé ne correspondait plus à la base.
Désormais `create_ticket` et `cancel_ticket` refusent dès qu'une clôture
d'événement existe. `correct_ticket` et `admin_correct_ticket` sont couvertes
indirectement : elles appellent `cancel_ticket` avant d'écrire. **Toute nouvelle
fonction qui écrit ou modifie des tickets doit refuser sur événement clôturé et
sur journée clôturée** — et avoir son test dans `tests/sql/cloture.test.ts`.
La garde d'événement dans `cancel_ticket` n'est testable qu'avec un ticket
« orphelin » inséré directement (jour sans clôture, événement clôturé) : sinon la
garde de jour refuse à sa place et la garde d'événement n'est jamais sollicitée.
Constat du 21/10/2026 : aucune clôture n'existait encore en production, le défaut
n'a donc touché aucune donnée réelle.
