import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client serveur : clé service_role, contourne le RLS. Ne doit JAMAIS être
// importé depuis un composant "use client" ni exposé au navigateur.
// Utilisé uniquement dans les routes API (src/app/api/**) pour les écritures :
// création/annulation/correction de tickets, import du catalogue, gestion
// des événements et des vendeurs.
export const supabaseServer = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
