import Link from "next/link";

const LINKS = [
  {
    href: "/admin/evenements",
    title: "Événements & vendeurs",
    desc: "Créer un événement, l'activer, gérer la liste des vendeurs.",
  },
  {
    href: "/admin/catalogue",
    title: "Catalogue",
    desc: "Importer le Référentiel Stand (xlsx) ou un CSV de secours.",
  },
  {
    href: "/admin/export",
    title: "Export fin de journée",
    desc: "Télécharger le fichier Excel de synthèse d'une journée de vente.",
  },
  {
    href: "/admin/caisse",
    title: "Caisse espèces",
    desc: "Comptage du fond initial et de la caisse chaque soir, comparé aux ventes espèces.",
  },
];

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <h1 className="text-lg font-bold">Admin</h1>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="block rounded-xl border border-black/10 bg-white p-4 shadow-sm"
        >
          <p className="font-semibold">{link.title}</p>
          <p className="text-sm text-black/60">{link.desc}</p>
        </Link>
      ))}
    </div>
  );
}
