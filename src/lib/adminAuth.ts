export const ADMIN_COOKIE = "camp_admin_session";

// Fonctionne à la fois en middleware (Edge) et dans les routes API (Node) :
// Web Crypto (crypto.subtle) est disponible dans les deux environnements.
export async function hashAdminPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAdminCookie(value: string | undefined): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !value) return false;
  const expected = await hashAdminPassword(secret);
  return value === expected;
}

// À utiliser dans les routes API qui modifient des données (événements,
// vendeurs, catalogue) : le gate du middleware ne protège que les pages,
// pas les appels directs à l'API.
export async function isAdminRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value);
}
