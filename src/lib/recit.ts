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
 * Ce repère oriente-t-il vraiment quelqu'un ?
 *
 * 🔴 L'INCIDENT DU 27/10/2026. Le fil affichait sous une photo de baobab
 *    « 🧭 face à cette épreuve ». Le récit racontait un arbre en danger : le
 *    collecteur (bot-diako) avait pris la locution « face à » pour un repère.
 *
 * ⚠ RÉGLÉ SUR LE CORPUS RÉEL, PAS SUR UNE IDÉE. Les 11 récits publiés qui
 *   portent la boussole ont été relus un par un le 27/10/2026. Cinq orientent
 *   vraiment — « en face N'Hair Beauty », « En face La Promenade », « entre
 *   Ambanitsena et Sahamamy, vers Antsapanana », « sur la route de
 *   Mahajanga », « À 20 km du Cap Sainte-Marie […] commune de Tranovaho ».
 *   Six sont des morceaux de phrase, dont DEUX portent un nom propre : « face,
 *   Nosy Be révèle toute sa magie » et « après une journée à Nosy Be ». Un
 *   seul critère ne suffisait donc pas. Les onze cas sont figés dans
 *   `recit.test.ts` : toute règle qui changera devra les repasser.
 *
 * ⚠ L'ASYMÉTRIE DES COÛTS AUTORISE LA SÉVÉRITÉ. Écarter à tort un vrai repère
 *   ne perd rien — le texte reste dans la citation d'origine. En garder un
 *   faux affirme une adresse qui n'existe pas, sous une icône de boussole.
 *
 * ⚠ CORRIGER ICI NE CORRIGE PAS LA SOURCE : le collecteur continuera d'en
 *   fabriquer. Le site cesse seulement de les croire.
 */
const DEBUTS_TEMPORELS = /^(après|apres|avant|pendant|depuis|lors|hier|demain|aujourd)/iu;

/** Ce qui trahit une phrase racontée plutôt qu'une indication de chemin. */
const MOTS_NARRATIFS = new Set([
  "se", "qui", "que", "quoi", "dont", "mieux", "toute", "toutes", "tout",
  "beaucoup", "révèle", "revele", "cache", "jusqu'au", "jusqu'à", "jusqu",
]);

/** Les lieux communs qui suffisent à orienter, même sans nom propre. */
const MOTS_DE_LIEU = new Set([
  "plage", "marché", "marche", "rue", "route", "avenue", "boulevard", "place",
  "église", "eglise", "mosquée", "mosquee", "temple", "école", "ecole",
  "lycée", "lycee", "hôpital", "hopital", "pharmacie", "banque", "gare",
  "port", "pont", "stade", "terrain", "station", "carrefour", "rond-point",
  "quartier", "village", "lac", "rivière", "riviere", "colline", "bureau",
  "épicerie", "epicerie", "boulangerie", "hôtel", "hotel", "parc", "jardin",
  "cimetière", "cimetiere", "aéroport", "aeroport", "bord", "plateau",
]);

function repereCredible(texte: string): boolean {
  const brut = texte.trim();
  if (brut === "") return false;
  if (DEBUTS_TEMPORELS.test(brut)) return false;

  const mots = brut.split(/[\s,;!?.()«»"]+/u).filter(Boolean);
  const nus = mots.map((m) => m.replace(/^['’]|['’]$/gu, "").toLocaleLowerCase("fr-FR"));
  if (nus.some((m) => MOTS_NARRATIFS.has(m))) return false;

  const nomPropre = mots.some((m) => /^[A-ZÀ-ÖØ-Þ]/u.test(m));
  const lieuCommun = nus.some((m) => MOTS_DE_LIEU.has(m));
  return nomPropre || lieuCommun;
}

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

export interface OptionsDecoupe {
  /**
   * ⚠ Vrai quand une COLONNE nomme déjà le lieu ou l'établissement. La ligne 📍
   *   n'est jetée que dans ce cas : sans colonne, elle est le seul endroit de
   *   la page qui dit où l'on est, et elle passe en prose.
   */
  lieuConnu?: boolean;
}

export function decouperRecit(
  corps: string | null | undefined,
  options: OptionsDecoupe = {},
): BlocsRecit {
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

    if (ligne.startsWith(PREFIXE_LIEU)) {
      if (options.lieuConnu !== false) continue; // déjà dit par le titre
      blocs.prose.push(ligne.slice(PREFIXE_LIEU.length).trim());
      continue;
    }
    /* ⚠ UN SEUL BLOC PAR MARQUEUR, ET LE RESTE EN PROSE. Une deuxième ligne
       🧭 ou 📞 était jetée en silence : ici, rien de ce que le bot a écrit ne
       peut disparaître de l'écran. */
    if (ligne.startsWith(PREFIXE_REPERE)) {
      const v = ligne.slice(PREFIXE_REPERE.length).trim();
      /* 🔴 UN REPÈRE INCROYABLE EST JETÉ, PAS RENVOYÉ EN PROSE : il est déjà
         dans le texte d'origine, et le reproduire plus bas ne ferait que
         répéter un fragment de phrase. Voir `repereCredible`. */
      if (!repereCredible(v)) continue;
      if (blocs.repere === null) blocs.repere = v;
      else blocs.prose.push(v);
      continue;
    }
    if (ligne.startsWith(PREFIXE_PRIX)) {
      const v = ligne.slice(PREFIXE_PRIX.length).trim();
      if (blocs.prix === null) blocs.prix = v;
      else blocs.prose.push(v);
      continue;
    }
    if (ligne.startsWith(PREFIXE_TEL)) {
      const v = ligne.slice(PREFIXE_TEL.length).trim();
      if (blocs.telephone === null) blocs.telephone = v;
      else blocs.prose.push(v);
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

/**
 * La partie DATÉE de la ligne 💰 : « 20 000 Ar le plat — relevé le 24/08/2026 »
 * → « relevé le 24/08/2026 ». Le montant, lui, est déjà porté par la colonne.
 */
export function dateDuReleve(prix: string | null): string | null {
  if (!prix) return null;
  const i = prix.indexOf(" — ");
  return i >= 0 ? prix.slice(i + 3).trim() || null : null;
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
