# Caisse événementielle C.A.M.P. France

Application de saisie des ventes sur stand événementiel (championnats, coupes du monde, festivals), pensée pour remplacer la saisie manuelle dans le fichier Excel « Caisse événementiel ».

- **Frontend** : Next.js (App Router, TypeScript, Tailwind CSS), PWA installable sur téléphone.
- **Base de données** : Supabase (Postgres) — numérotation atomique des tickets, Realtime pour la liste des ventes.
- **Hébergement** : Vercel, déploiement automatique à chaque push sur GitHub.

Pour la mise en route pas-à-pas côté non-développeur (compte Supabase/Vercel, déploiement, configuration d'un événement), voir [DEPLOYMENT.md](./DEPLOYMENT.md).

La fiche mémo « jour J » à imprimer avant un événement est disponible dans l'app elle-même, onglet **Aide** (`/aide`).

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés Supabase
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Structure du projet

```
src/
  app/
    page.tsx              Accueil : sélection du vendeur
    nouveau/               Saisie d'un nouveau ticket (+ correction)
    ventes/                Liste des ventes du jour (Realtime)
    aide/                  Fiche mémo imprimable
    admin/
      evenements/          Créer/activer un événement, gérer les vendeurs
      catalogue/            Import du Référentiel Stand (xlsx) ou CSV
      export/               Export Excel de fin de journée
    api/                    Routes serveur (écritures via clé service_role)
  components/               Composants UI partagés
  lib/
    supabase/               Clients Supabase (navigateur = lecture, serveur = écriture)
    catalogueParser.ts       Lecture xlsx/CSV, mapping des colonnes par intitulé
    excelExport.ts           Génération du fichier Excel de synthèse
    offlineQueue.ts          File d'attente locale (tickets non perdus en cas de coupure réseau)
    types.ts                 Types partagés
supabase/
  schema.sql                 Schéma complet à exécuter dans Supabase (SQL Editor)
```

## Principes de fiabilité

- **Numérotation des tickets** : attribuée côté serveur par une fonction Postgres (`next_ticket_number`) qui verrouille la ligne du compteur du jour — deux vendeurs ne peuvent jamais recevoir le même numéro, même en validant à la même seconde.
- **Rien ne disparaît silencieusement** : un ticket annulé ou corrigé reste dans la base, marqué comme tel, avec la raison si fournie. Une « correction » annule l'original et crée un nouveau ticket lié (`remplace_ticket_id`).
- **Tolérance aux micro-coupures** : si l'envoi d'un ticket échoue pour une raison réseau, il est conservé dans le navigateur (`localStorage`) et renvoyé automatiquement dès que la connexion revient (voir `src/lib/offlineQueue.ts`). Les erreurs métier (ex. donnée invalide) ne sont pas mises en file — l'app prévient immédiatement l'utilisateur.
- **Catalogue par intitulé de colonne, jamais par position** : l'import lit les en-têtes du fichier et propose un mapping (avec aperçu) à confirmer avant import, pour rester robuste aux évolutions du template Référentiel Stand.
