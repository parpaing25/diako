/**
 * Découper le corps d'un récit en blocs affichables.
 *
 * ⭐ POURQUOI (03/09/2026). `posts.body` n'est pas de la prose : il est
 *   fabriqué ligne à ligne par le bot (`bot-diako/bot/redaction.py`,
 *   `corps_recit`). Affiché en un seul pavé, il donne ce qu'on voyait sur
 *   /post/<id> : un titre déjà répété au-dessus, une citation noyée, un numéro
 *   de téléphone qu'on ne peut pas composer, et la provenance perdue au milieu.
 *
 * ⚠ RIEN N'EST DÉDUIT DU TEXTE. Le lieu vient de `posts.place`, l'établissement
 *   de `page_name`, le prix de `price_ar` : ce sont des colonnes, elles font
 *   foi. Le corps ne sert qu'à la MISE EN PAGE. La ligne 📍 en est la preuve —
 *   elle porte le nom de l'établissement dans 262 cas et le lieu dans 210,
 *   sans rien qui dise lequel : impossible d'en tirer une donnée, donc on la
 *   jette (le titre de la page la dit déjà).
 *
 * ⚠ AUCUN MARQUEUR N'EST GARANTI. Le modèle peut rendre un corps libre
 *   (`redaction.py` le laisse passer). Tout ce qu'aucun préfixe ne reconnaît
 *   part en prose, affiché tel quel : le rendu ne doit jamais échouer sur un
 *   marqueur absent.
 */

export interface BlocsRecit {
  /** Ce que la personne a écrit, entre guillemets dans le corps. */
  citation: string | null;
  /** Le reste du texte, quand il n'y a pas de citation ou qu'il en reste. */
  prose: string[];
  /** « 🧭 en face de N'Hair Beauty » — le repère, sans son emoji. */
  repere: string | null;
  /** « 💰 20 000 Ar le plat » — ignoré dès que `price_ar` existe. */
  prix: string | null;
  /** Le numéro tel qu'il est écrit ; l'appel se fait sur les chiffres seuls. */
  telephone: string | null;
  /** « Vu sur Facebook — X le JJ/MM/AAAA », une seule fois. */
  source: string | null;
}

const PREFIXE_REPERE = "🧭";
const PREFIXE_PRIX = "💰";
const PREFIXE_TEL = "📞";
const PREFIXE_LIEU = "📍";
const DEBUT_SOURCE = "Vu sur Facebook";

/**
 * ⚠ LE TEST DE LA CITATION PORTE SUR LES BORNES, PAS SUR L'INTÉRIEUR. Deux
 *   récits contiennent eux-mêmes des guillemets français ; une expression qui
 *   irait chercher le contenu entre « et » couperait au premier guillemet
 *   interne. On regarde donc seulement si la ligne commence par « et finit par
 *   » ou par « … » — le bot tronque à 400 caractères et pose une ellipse.
 */
function estUneCitation(ligne: string): boolean {
  return ligne.startsWith("«") && (ligne.endsWith("»") || ligne.endsWith("» "));
}

function sansGuillemets(ligne: string): string {
  return ligne
    .replace(/^«\s*/, "")
    .replace(/\s*»$/, "")
    .replace(/…\s*$/, "")
    .trim();
}

export function decouperRecit(corps: string | null | undefined): BlocsRecit {
  const blocs: BlocsRecit = {
    citation: null,
    prose: [],
    repere: null,
    prix: null,
    telephone: null,
    source: null,
  };
  if (!corps) return blocs;

  /* ⚠ LIGNE À LIGNE, JAMAIS PAR PARAGRAPHE. Le pied du corps colle prix,
     téléphone et provenance par de simples sauts de ligne : découpé en
     paragraphes, il ne fait qu'un seul bloc. */
  for (const brute of corps.split("\n")) {
    const ligne = brute.trim();
    if (!ligne) continue;

    if (ligne.startsWith(PREFIXE_LIEU)) continue; // déjà dit par le titre
    if (ligne.startsWith(PREFIXE_REPERE)) {
      blocs.repere ??= ligne.slice(PREFIXE_REPERE.length).trim();
      continue;
    }
    if (ligne.startsWith(PREFIXE_PRIX)) {
      blocs.prix ??= ligne.slice(PREFIXE_PRIX.length).trim();
      continue;
    }
    if (ligne.startsWith(PREFIXE_TEL)) {
      blocs.telephone ??= ligne.slice(PREFIXE_TEL.length).trim();
      continue;
    }
    if (ligne.startsWith(DEBUT_SOURCE)) {
      /* ⚠ DÉDOUBLONNÉE : 25 des 219 récits publiés portent cette ligne deux
         fois — collectés avant le garde-fou posé dans redaction.py, qui n'a
         pas réparé le passé. */
      blocs.source ??= ligne;
      continue;
    }
    if (estUneCitation(ligne) && !blocs.citation) {
      blocs.citation = sansGuillemets(ligne);
      continue;
    }
    blocs.prose.push(ligne);
  }

  return blocs;
}

/** Les chiffres seuls, pour `tel:` — le texte affiché garde ses espaces. */
export function numeroAppelable(telephone: string | null): string | null {
  if (!telephone) return null;
  const chiffres = telephone.replace(/[^\d+]/g, "");
  return chiffres.length >= 9 ? chiffres : null;
}

/**
 * « 24 août 2026 » — la date entière, pas un « il y a 1 j ».
 * ⚠ Sur cette page on vient souvent d'un lien reçu des semaines plus tard :
 *   un relatif n'y veut plus rien dire.
 */
export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
