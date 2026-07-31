// ============================================================================
// Compteur de visites RÉEL (page_views), anonyme et fire-and-forget.
//
// À chaque changement de route (et à la 1re visite), on insère une ligne dans
// la table `page_views` via l'API REST Supabase avec la clé anon de l'app.
// AUCUNE PII :
//   - path  : pathname seul (jamais de query string ni de hash) ;
//   - ref   : domaine du referrer uniquement (null si interne au site) ;
//   - sid   : identifiant ALÉATOIRE de session (sessionStorage — meurt avec
//             l'onglet, jamais persisté, ne permet aucune identification).
// Mesure d'audience strictement anonyme (aucun cookie persistant, aucun
// recoupement possible) — pas de consentement requis.
//
// JAMAIS bloquant : fetch keepalive, aucun await côté appelant, échec 100 %
// silencieux. Tant que la table n'existe pas (vague27 non appliquée), les
// requêtes échouent en 404/401 côté réseau SANS AUCUN effet visible pour
// l'utilisateur (pas d'erreur console, pas de toast, navigation intacte).
// Anti-egress : INSERT uniquement (Prefer: return=minimal), aucune lecture.
// ============================================================================

// Mêmes valeurs (et mêmes secours) que src/integrations/supabase/client.ts —
// module volontairement autonome : zéro import, zéro poids sur le bundle.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://eifrwecaszzqrdwjjjbu.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ";

/** Id de session aléatoire — sessionStorage (par onglet, jamais persisté). */
function getSessionId(): string | null {
  try {
    let sid = sessionStorage.getItem("dk_sid");
    if (!sid) {
      sid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("dk_sid", sid);
    }
    return sid.slice(0, 63);
  } catch {
    return null; // sessionStorage indisponible → on compte quand même, sans sid
  }
}

/** Path nettoyé : pathname seul, sans query ni hash, borné (< 200 côté RLS). */
function cleanPath(pathname: string): string {
  const p = (pathname.split("?")[0].split("#")[0] || "/").trim();
  return p.slice(0, 190) || "/";
}

/** Referrer réduit au DOMAINE seul ; null si vide ou interne au site. */
function refDomain(): string | null {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    if (!host || host === window.location.hostname) return null;
    return host.slice(0, 190);
  } catch {
    return null;
  }
}

// Anti-doublon : ne pas recompter le même path deux fois de suite
// (StrictMode, re-render, retour au même écran sans navigation réelle).
let lastPath: string | null = null;

/**
 * Compte une page vue — fire-and-forget, jamais bloquant, jamais d'erreur.
 * À appeler à chaque changement de route (le hook s'en charge).
 */
export function trackView(pathname: string): void {
  try {
    const path = cleanPath(pathname);
    if (path === lastPath) return;
    lastPath = path;

    const body = JSON.stringify({
      path,
      ref: refDomain(),
      sid: getSessionId(),
    });

    // fetch keepalive : la requête survit à la navigation/fermeture d'onglet,
    // n'attend rien (pas de .then), avale toute erreur (réseau, 404, 401…).
    fetch(`${SUPABASE_URL}/rest/v1/page_views`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body,
    }).catch(() => {});
  } catch {
    // silencieux — le comptage ne doit JAMAIS gêner la navigation
  }
}
