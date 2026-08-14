/**
 * JOURNAL D'ERREURS — savoir ce qui casse chez les autres.
 *
 * Le problème qu'il résout : une erreur qui ne se produit que sur un Android
 * de 2019, à Toliara, en 3G, n'apparaîtra JAMAIS dans la console du
 * développeur. Sans trace, elle n'existe pas — et elle fait pourtant fuir un
 * utilisateur sur deux.
 *
 * Trois règles, dans cet ordre :
 *
 *  ① AUCUNE DONNÉE PERSONNELLE. On enregistre le message, la page et le
 *    navigateur. Jamais le contenu d'un champ, jamais un identifiant, jamais
 *    une position. Un journal d'erreurs qui devient un journal de navigation
 *    est un problème, pas une solution.
 *
 *  ② ÇA NE DOIT JAMAIS CASSER LE SITE. Tout est enveloppé : si l'envoi échoue,
 *    on n'en parle pas. Un outil de diagnostic qui provoque une panne est une
 *    plaisanterie qu'on a déjà vue ailleurs.
 *
 *  ③ ANTI-RAFALE. Une boucle de rendu peut produire mille erreurs identiques
 *    en une seconde. On plafonne, et on regroupe par signature.
 */

import { supabase } from "@/integrations/supabase/client";

const MAX_PAR_SESSION = 10;
const FENETRE_DOUBLON_MS = 30_000;

let envoyees = 0;
const vues = new Map<string, number>();

function signature(message: string, source: string): string {
  return `${message.slice(0, 120)}|${source.slice(0, 80)}`;
}

/** Retire ce qui pourrait identifier quelqu'un d'une chaîne d'erreur. */
function nettoyer(texte: string): string {
  return texte
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[courriel]")
    .replace(/\+?261[\s\d]{7,}/g, "[téléphone]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[identifiant]")
    .slice(0, 500);
}

export interface ErreurJournalisee {
  message: string;
  source: string;
  ligne?: number | null;
  pile?: string | null;
}

export async function journaliser(e: ErreurJournalisee): Promise<void> {
  try {
    if (envoyees >= MAX_PAR_SESSION) return;

    const sig = signature(e.message, e.source);
    const derniere = vues.get(sig) ?? 0;
    if (Date.now() - derniere < FENETRE_DOUBLON_MS) return;
    vues.set(sig, Date.now());
    envoyees += 1;

    await supabase.from("journal_erreurs").insert({
      message: nettoyer(e.message),
      source: nettoyer(e.source),
      ligne: e.ligne ?? null,
      pile: e.pile ? nettoyer(e.pile) : null,
      chemin: window.location.pathname,
      navigateur: navigator.userAgent.slice(0, 200),
      // Sur ce marché, la qualité du réseau explique la moitié des pannes.
      reseau:
        (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
          ?.effectiveType ?? null,
    });
  } catch {
    /* Un journal qui casse le site serait pire que pas de journal du tout. */
  }
}

/** À appeler une fois au démarrage. */
export function installerJournalErreurs(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (ev) => {
    void journaliser({
      message: ev.message || "Erreur inconnue",
      source: ev.filename || "inconnu",
      ligne: ev.lineno,
      pile: ev.error instanceof Error ? ev.error.stack ?? null : null,
    });
  });

  // Une promesse rejetée sans catch ne déclenche PAS window.onerror : c'est
  // la moitié des erreurs d'une application qui parle à une base.
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    void journaliser({
      message: r instanceof Error ? r.message : String(r).slice(0, 200),
      source: "promesse non traitée",
      pile: r instanceof Error ? r.stack ?? null : null,
    });
  });
}
