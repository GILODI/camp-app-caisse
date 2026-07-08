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
          <li>Une icône « Caisse CAMP » apparaît sur l&apos;écran d&apos;accueil, comme une vraie application.</li>
        </ol>
      </Section>

      <Section title="2. Ajouter un ticket">
        <ol className="list-decimal space-y-1 pl-5">
          <li>À l&apos;ouverture, choisir son nom (Alex / Collègue).</li>
          <li>Onglet « Nouveau » → rechercher un produit par référence ou nom.</li>
          <li>Toucher le produit pour l&apos;ajouter, ajuster la quantité avec + / −.</li>
          <li>Le total se met à jour automatiquement à chaque ligne.</li>
        </ol>
      </Section>

      <Section title="3. Encaisser">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Choisir le mode de paiement : CB, CB sans contact, Espèces ou Chèque.</li>
          <li>Toucher « Valider le ticket ».</li>
          <li>
            Le <strong>numéro de ticket</strong> et le <strong>montant</strong> s&apos;affichent en grand — à noter au
            dos du reçu CB si besoin.
          </li>
        </ol>
      </Section>

      <Section title="4. Corriger une erreur">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Onglet « Ventes du jour » → repérer le ticket concerné.</li>
          <li>
            <strong>Annuler</strong> : si la vente ne doit plus compter. Le ticket reste visible, marqué « annulé ».
          </li>
          <li>
            <strong>Corriger</strong> : pour une erreur de quantité ou de produit. L&apos;ancien ticket est annulé
            automatiquement et un nouveau ticket (avec un nouveau numéro) est créé avec les bonnes lignes.
          </li>
        </ol>
      </Section>

      <Section title="5. Exporter en fin de journée">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Onglet « Ventes du jour » → bouton « Exporter » (ou Admin → Export fin de journée).</li>
          <li>Le fichier Excel se télécharge automatiquement (Caisse_[Événement]_[Date].xlsx).</li>
          <li>Il contient les totaux par mode de paiement, les statistiques et le détail de chaque ticket.</li>
        </ol>
      </Section>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Coupure réseau ?</strong> Pas de panique : un ticket en cours de validation n&apos;est jamais perdu.
        L&apos;app retente automatiquement l&apos;envoi dès que la connexion revient. Ne pas fermer la page tant que
        « Envoi en cours… » est affiché.
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
