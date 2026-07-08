const PARIS_TZ = "Europe/Paris";

// Date du jour (YYYY-MM-DD) au fuseau Europe/Paris, cohérente avec la date
// utilisée côté serveur pour la numérotation des tickets (voir next_ticket_number).
export function todayParisISO(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDateFR(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTimeFR(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}
