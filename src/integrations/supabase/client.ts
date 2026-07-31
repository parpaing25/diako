import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Projet Supabase DIAKO — volontairement SÉPARÉ de celui de Fonenako.
// Motif (cf. docs/TDR-DIAKO.md §4.2) : le quota d'egress gratuit est de 2 Go
// PAR PROJET. Un fil infini d'images ne doit jamais pouvoir faire tomber
// fonenako.mg, qui est en production.
//
// La clé « anon » est publique par nature (elle est dans le bundle) : la
// sécurité repose entièrement sur la RLS, jamais sur le secret de cette clé.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://eifrwecaszzqrdwjjjbu.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ";

export const SUPABASE_PROJECT_URL = SUPABASE_URL;
export const SUPABASE_PUBLIC_KEY = SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: { "x-application-name": "diako" },
  },
  // Realtime : RIEN par défaut. Règle gravée au jour 1 — le temps réel n'est
  // autorisé QUE sur le chat et les notifications (Lot 5). Sur Fonenako,
  // 17 channels ont produit ~6 Go/mois de heartbeats sur un quota de 2 Go.
  realtime: { params: { eventsPerSecond: 2 } },
});
