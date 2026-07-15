# Attestation individuelle — brouillon de travail

**⚠️ Ce document est un brouillon préparé pour être revu avec un expert-comptable, pas une attestation finale.** Il sert de base de discussion pour confirmer le périmètre d'application et valider (ou corriger) la description technique ci-dessous, avant toute émission d'une attestation individuelle au sens de l'article 286 I 3° bis du Code général des impôts.

---

## 1. Identification

- **Logiciel** : Caisse événementielle C.A.M.P. France
- **Éditeur** : développement interne pour C.A.M.P. FRANCE SARL (SIRET 343 953 451 00022), pas d'éditeur tiers commercial.
- **Nature de l'usage** : encaissement lors d'événements ponctuels (salons, compétitions sportives sponsorisées...), **2 à 3 fois par an maximum**, pas de vente courante ni de point de vente permanent.
- **Date du présent brouillon** : à compléter au moment de la remise à l'expert-comptable.

## 2. Question préalable de périmètre

Avant toute chose, à faire trancher par l'expert-comptable : est-ce que cet usage ponctuel (2-3 événements par an, hors activité de vente courante) entre dans le champ d'application strict de l'obligation de certification, et si oui, sous quelle forme (attestation individuelle de l'éditeur/utilisateur, ou certification par un organisme accrédité) ? C'est cette réponse qui détermine si le reste de ce document est suffisant ou s'il faut aller plus loin.

## 3. Description au regard des quatre critères légaux

### Inaltérabilité

**Exigence** : les données enregistrées ne doivent pouvoir être ni modifiées ni supprimées après validation.

**Mise en œuvre** :
- Un ticket validé n'est **jamais modifié ni supprimé** en base. Toute correction crée un nouveau ticket, numéroté séparément, et marque l'ancien comme annulé (`statut = ANNULE`) avec motif, date et auteur de l'annulation conservés — l'historique complet reste consultable.
- Depuis [DATE À COMPLÉTER], un mécanisme de **clôture périodique** permet de figer définitivement une journée de vente (puis l'événement entier une fois tous ses jours clôturés) : passée la clôture, la base de données elle-même refuse toute nouvelle création, correction ou annulation de ticket sur la période concernée — pas seulement une restriction d'interface.
- Chaque clôture porte une **empreinte de contrôle (SHA-256)** calculée sur l'ensemble des tickets de la période (numéro, montant, statut). Toute modification a posteriori des données sous-jacentes rendrait cette empreinte invérifiable, ce qui permet de détecter une altération.

**Limite connue** : le chaînage n'est pas fait ticket par ticket (chaque ticket ne contient pas le hash du précédent) mais par lot à la clôture. À signaler à l'expert-comptable pour avis sur la suffisance de ce niveau de granularité vu le volume et la fréquence d'usage.

### Sécurisation

**Exigence** : les données doivent être protégées contre la perte et l'accès non autorisé.

**Mise en œuvre** :
- Hébergement sur Supabase (base de données PostgreSQL managée), avec sauvegardes automatiques et chiffrement au repos.
- Écriture en base réservée exclusivement au serveur applicatif (clé `service_role`), jamais accessible depuis le navigateur — les règles de sécurité au niveau des lignes (Row Level Security) l'interdisent explicitement.
- Accès aux écrans de vente protégé par un code par événement ; accès à l'espace d'administration protégé par mot de passe.
- Connexions chiffrées (HTTPS) de bout en bout (hébergement Vercel).

**Limites connues, à documenter honnêtement plutôt qu'à passer sous silence** :
- Le mot de passe administrateur est unique et partagé, pas de compte individualisé par personne — pas de traçabilité nominative des actions d'administration (contrairement aux ventes, où chaque ticket porte le nom du vendeur).
- Pas de protection anti-force-brute (blocage après plusieurs échecs) sur le mot de passe admin ni sur le code d'accès événement.
- Politique de rétention des sauvegardes dépendante du plan Supabase souscrit — à vérifier/documenter précisément.
- Pas de procédure écrite de rotation de la clé secrète en cas de compromission suspectée.

### Conservation

**Exigence** : les données doivent être conservées pendant la durée légale (6 ans).

**Mise en œuvre** :
- Aucune fonctionnalité de suppression de ticket, facture ou mouvement de caisse n'existe dans l'application (hors un bouton de réinitialisation strictement réservé aux événements explicitement marqués "de test", verrouillé au niveau de la base de données pour ne jamais pouvoir s'appliquer à un événement réel).
- Conservation illimitée par défaut sur Supabase, sans purge automatique programmée.
- Export Excel complet disponible à tout moment (par jour ou pour l'événement entier), permettant une conservation externe redondante.

**Limite connue** : pas de politique d'archivage formelle au-delà de la conservation en base (pas de copie froide périodique programmée hors sauvegardes Supabase). À voir si nécessaire selon l'avis de l'expert-comptable.

### Archivage

**Exigence** : des clôtures périodiques (a minima annuelles) doivent figer les données de manière définitive.

**Mise en œuvre** :
- Vu la nature de l'usage (2-3 événements ponctuels par an, sans continuité entre eux), le découpage retenu est **jour de vente** puis **événement entier**, plutôt que jour/mois/année calendaires qui n'ont pas de sens pour ce mode d'exploitation — c'est l'événement, pas le mois civil, qui constitue la période comptable naturelle ici. Point à valider explicitement avec l'expert-comptable.
- Chaque clôture (jour ou événement) enregistre : nombre de tickets, total TTC, empreinte de contrôle, date et auteur de la clôture — consultable à tout moment dans un registre dédié (Admin → Clôtures).
- Une clôture d'événement n'est possible que si tous les jours de vente de cet événement sont déjà clôturés individuellement, ce qui évite qu'une donnée reste modifiable sous couvert d'une clôture d'ensemble qui la laisserait croire figée.

## 4. Points à valider avec l'expert-comptable

1. Le périmètre (section 2) — condition préalable à tout le reste.
2. Le découpage "jour de vente / événement" retenu pour l'archivage est-il acceptable en lieu et place de jour/mois/année calendaires ?
3. Les limites de sécurisation listées (mot de passe admin partagé, pas de protection anti-force-brute) sont-elles acceptables pour ce niveau d'usage, ou faut-il les corriger avant certification ?
4. Le niveau de granularité du chaînage (par clôture, pas ticket par ticket) est-il suffisant ?
5. Forme finale attendue de l'attestation — modèle propre au cabinet, ou modèle-type à adapter.
