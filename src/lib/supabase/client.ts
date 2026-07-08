"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client navigateur : clé anonyme, lecture seule côté RLS (voir supabase/schema.sql).
// Utilisé pour l'abonnement Realtime et les lectures (liste des ventes, catalogue).
export const supabaseBrowser = createClient(url, anonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
