"use client";

export default function AidePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-5 print:p-0 print:text-black">
      <div className="no-print flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white"
        >
          Imprimer / PDF
        </button>
      </div>

      <h1 className="text-2xl font-black">Fiche mémo — Jour J</h1>
      <p className="-mt-3 text-sm text-black/60">Caisse événementielle C.A.M.P. France</p>

      <Section title="1. Ouvrir l'app sur son téléphone">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Ouvrir le lien de l&apos;app dans le navigateur (Safari sur iPhone, Chrome sur Android).</li>
          <li>
            Menu de partage (iPhone) ou menu ⋮ (Android) → <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.
          </li>
          <li>
            Une icône « Caisse_événement » apparaît sur l&apos;écran d&apos;accueil, comme une vraie application.
          </li>
        </ol>
      </Section>

      <Section title="2. Ajouter un ticket">
        <ol className="list-decimal space-y-1 pl-5">
          <li>À l&apos;ouverture, choisir son prénom dans la liste des vendeurs de l&apos;événement.</li>
          <li>
            La première fois, entrer le <strong>code d&apos;accès</strong>{" "}
            de l&apos;événement (donné par le responsable) — à faire une seule fois par téléphone.
          </li>
          <li>Onglet « Nouveau » → rechercher un produit par référence ou nom.</li>
          <li>
            Ou toucher le bouton <strong>📷</strong>{" "}
            (à droite de la recherche) et viser le code-barres de l&apos;étiquette : le produit s&apos;ajoute
            tout seul.
          </li>
          <li>Toucher le produit pour l&apos;ajouter, ajuster la quantité avec + / −.</li>
          <li>
            Besoin d&apos;une remise ? Toucher le prix de la ligne pour le modifier. Le prix d&apos;origine reste
            enregistré, la remise apparaît dans l&apos;export.
          </li>
          <li>Le total se met à jour automatiquement à chaque ligne.</li>
        </ol>
      </Section>

      <Section title="3. Encaisser">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Choisir le mode de paiement : CB, CB sans contact, Espèces ou Chèque.</li>
          <li>
            En espèces : la <strong>calculette de rendu-monnaie</strong>{" "}
            s&apos;affiche — saisir la somme donnée par le client, l&apos;app calcule la monnaie à rendre.
          </li>
          <li>Toucher « Valider le ticket ».</li>
          <li>
            Le <strong>numéro de ticket</strong> et le <strong>montant</strong>{" "}
            s&apos;affichent en grand — à noter au dos du reçu CB si besoin.
          </li>
        </ol>
      </Section>

      <Section title="4. Reçu et demande de facture">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>📤 Envoyer le reçu au client</strong> : envoie le ticket de caisse en PDF (SMS, WhatsApp,
            mail…) depuis le téléphone.
          </li>
          <li>
            <strong>🧾 Le client demande une facture</strong>{" "}
            : noter nom, prénom, adresse, téléphone et email
            (SIRET si c&apos;est un professionnel). La facture n&apos;est pas éditée sur place — elle sera
            établie ensuite par le service comptable à partir de ces informations.
          </li>
          <li>
            Oublié sur le moment ? Les deux boutons sont aussi disponibles sur chaque ticket dans{" "}
            <strong>« Ventes du jour »</strong>, tant que la journée n&apos;est pas clôturée.
          </li>
        </ul>
      </Section>

      <Section title="5. Corriger une erreur">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Onglet « Ventes du jour » → repérer le ticket concerné.</li>
          <li>
            <strong>Annuler</strong> : si la vente ne doit plus compter. Le ticket reste visible, marqué « annulé ».
          </li>
          <li>
            <strong>Corriger</strong>{" "}
            : pour une erreur de quantité ou de produit. L&apos;ancien ticket est annulé automatiquement et un
            nouveau ticket (avec un nouveau numéro) est créé avec les bonnes lignes. Si une facture avait été
            demandée, elle suit automatiquement le nouveau ticket.
          </li>
        </ol>
      </Section>

      <Section title="6. Exporter en fin de journée">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Onglet « Ventes du jour » → bouton « Exporter » (ou Admin → Export fin de journée).</li>
          <li>Le fichier Excel se télécharge automatiquement (Caisse_[Événement]_[Date].xlsx).</li>
          <li>
            Il contient les totaux par mode de paiement, les statistiques, le détail de chaque ticket et, s&apos;il
            y en a eu, une feuille « Demandes de facture ».
          </li>
          <li>
            Les ventes avec demande de facture sont <strong>sorties du total à traiter en bloc</strong>{" "}
            (elles seront saisies une par une en comptabilité) — un total de contrôle rassemble malgré tout
            l&apos;ensemble.
          </li>
        </ol>
      </Section>

      <Section title="7. Après l'événement (responsable)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Admin → <strong>Clôtures</strong>{" "}
            : clôturer chaque journée de vente, puis l&apos;événement.
          </li>
          <li>
            Une journée clôturée est définitivement figée : plus aucun ticket ne peut y être ajouté, corrigé ou
            annulé. C&apos;est ce qui garantit la conformité fiscale de la caisse.
          </li>
          <li>
            Admin → <strong>Export fin de journée</strong> → « Archive complète » : un seul fichier Excel avec
            toutes les ventes, le stock, la caisse espèces et les demandes de facture.
          </li>
        </ol>
      </Section>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Coupure réseau ?</strong>{" "}
        Pas de panique : un ticket en cours de validation n&apos;est jamais perdu. L&apos;app retente
        automatiquement l&apos;envoi dès que la connexion revient. Ne pas fermer la page tant que « Envoi en
        cours… » est affiché.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 text-base font-bold text-brand">{title}</h2>
      <div className="text-sm leading-snug">{children}</div>
    </section>
  );
}
