# Guide de déploiement — pas à pas (pour non-développeur)

Ce guide t'accompagne pour mettre l'application en ligne la première fois, puis pour la réutiliser à chaque nouvel événement. Prévoir environ 20 minutes la première fois.

---

## Partie A — Mise en ligne (une seule fois)

### 1. Récupérer les identifiants Supabase

1. Va sur [supabase.com](https://supabase.com) et ouvre le projet dédié à la caisse événementielle (celui que tu as créé, séparé de ton premier projet).
2. Dans le menu de gauche : **Project Settings** (roue crantée) → **API**.
3. Note trois valeurs, tu en auras besoin dans un instant :
   - **Project URL** (ressemble à `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** (clé publique)
   - **service_role** (clé secrète — ne jamais la partager publiquement)

### 2. Créer les tables dans Supabase

1. Toujours dans le projet Supabase, ouvre **SQL Editor** (menu de gauche).
2. Clique sur **New query**.
3. Ouvre le fichier [`supabase/schema.sql`](./supabase/schema.sql) de ce projet, copie tout son contenu, colle-le dans l'éditeur SQL.
4. Clique sur **Run**. Tu dois voir « Success. No rows returned ». C'est normal — ce script crée les tables, pas de données.

### 3. Mettre le code sur GitHub

Si ce n'est pas déjà fait par la personne qui t'accompagne :

```bash
git remote add origin https://github.com/<ton-compte>/camp-app-caisse.git
git push -u origin master
```

### 4. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) et connecte-toi (avec ton compte GitHub).
2. Clique sur **Add New… → Project**.
3. Choisis le dépôt GitHub **camp-app-caisse** dans la liste, puis **Import**.
4. Avant de cliquer sur Deploy, ouvre la section **Environment Variables** et ajoute les 3 valeurs récupérées à l'étape 1 :

   | Nom de la variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ton Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ta clé anon public |
   | `SUPABASE_SERVICE_ROLE_KEY` | ta clé service_role |

5. Clique sur **Deploy**. Après 1 à 2 minutes, Vercel te donne une URL du type `https://camp-app-caisse.vercel.app` — c'est le lien à partager avec les vendeurs.

À partir de maintenant, **chaque fois que du code est modifié et poussé sur GitHub (`git push`), Vercel redéploie automatiquement** — rien à refaire manuellement.

---

## Partie B — Préparer un nouvel événement (à chaque fois)

À faire quelques jours avant chaque événement, une fois l'app en ligne.

### 1. Créer et activer l'événement

1. Ouvre l'app → onglet **Admin** (en haut à droite) → **Événements & vendeurs**.
2. Dans « Nouvel événement », tape le nom (ex. « Coupe du monde Chamonix 2026 ») → **Créer**.
3. Clique sur **Activer** à côté de cet événement. Un seul événement peut être actif à la fois — c'est celui que les vendeurs verront.

### 2. Ajouter les vendeurs

Toujours sur cette page, section « Vendeurs de l'événement actif » : tape un prénom (ex. « Alex ») → **Ajouter**. Répète pour chaque vendeur (ex. « Collègue »).

### 3. Importer le catalogue

1. Onglet **Admin → Catalogue**.
2. Choisis le fichier `[TEMPLATE] Referentiel Stand — CAMP.xlsx` de l'événement (onglet Catalogue), ou à défaut un CSV avec les colonnes Référence / Désignation / Catégorie / Prix.
3. L'app propose automatiquement une correspondance de colonnes — vérifie que « Prix TTC remisé » pointe bien vers la bonne colonne (celle du prix déjà remisé, pas le prix public).
4. Choisis **« Ajouter / mettre à jour »** (si c'est un complément) ou **« Remplacer tout le catalogue »** (si c'est une nouvelle version complète du fichier).
5. Clique sur **Confirmer l'import**.

L'app est prête : chaque vendeur peut maintenant ouvrir le lien, choisir son nom, et vendre.

---

## En fin de journée

Onglet **Ventes du jour → Exporter** (ou **Admin → Export fin de journée** pour choisir une date différente). Le fichier `Caisse_[Événement]_[Date].xlsx` se télécharge, prêt à être resaisi dans le système comptable interne.

---

## Problèmes fréquents

- **« Aucun événement actif »** : personne n'a encore activé d'événement — voir Partie B, étape 1.
- **Recherche produit vide** : le catalogue n'a pas été importé pour cet événement — voir Partie B, étape 3.
- **La page ne s'affiche pas / erreur** : vérifie que les 3 variables d'environnement sont bien renseignées dans Vercel (Project Settings → Environment Variables), puis redéploie (Vercel → Deployments → ⋯ → Redeploy).
- **Un vendeur n'a pas de réseau une seconde en pleine saisie** : pas d'action à faire, l'app retente l'envoi automatiquement (voir la fiche mémo, onglet Aide).
