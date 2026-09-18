/**
 * Où revenir après la connexion.
 *
 * ⚠ Avant le 18/09/2026, toute connexion renvoyait à l'accueil (Auth.tsx et
 *   Bienvenue.tsx faisaient `navigate("/")`). Le visiteur arrivé de Facebook sur
 *   /lieu/andasibe qui touchait « Garder » se retrouvait sur le fil, sa page
 *   perdue. Le gérant qui touchait « C'est mon établissement » perdait sa fiche
 *   deux fois dans le parcours.
 *
 * On mémorise la page d'origine en localStorage (et non en sessionStorage) :
 * le lien de confirmation d'e-mail s'ouvre souvent dans un AUTRE navigateur que
 * le navigateur intégré de Facebook, et la mémoire de session n'y survit pas.
 * Au-delà d'une heure, la suite est oubliée : on ne renvoie pas quelqu'un sur
 * une page d'hier.
 */
const CLE = "dk-suite";
const DUREE_MS = 60 * 60 * 1000;

/** Un chemin interne, jamais une adresse externe (« //site », « /\site »). */
function interne(chemin: string): boolean {
  return chemin.startsWith("/") && !chemin.startsWith("//") && !chemin.startsWith("/\\");
}

/** Pages où l'on ne revient jamais : on en sort justement. */
function exclue(chemin: string): boolean {
  return /^\/(auth|bienvenue)(\/|\?|#|$)/.test(chemin);
}

export function memoriserSuite(chemin: string): void {
  if (!interne(chemin) || exclue(chemin)) return;
  try {
    localStorage.setItem(CLE, JSON.stringify({ p: chemin, t: Date.now() }));
  } catch {
    /* navigation privée ou stockage bloqué : on retombera sur l'accueil */
  }
}

/** La page où revenir, ou null (absente, périmée, suspecte). */
export function lireSuite(): string | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const { p, t } = JSON.parse(brut) as { p?: unknown; t?: unknown };
    if (typeof p !== "string" || typeof t !== "number") return null;
    if (Date.now() - t > DUREE_MS) return null;
    if (!interne(p) || exclue(p)) return null;
    return p;
  } catch {
    return null;
  }
}

export function oublierSuite(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire */
  }
}
