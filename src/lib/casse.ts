/**
 * Adoucir les paragraphes écrits TOUT EN CAPITALES — à l'affichage seulement.
 *
 * 🔴 POURQUOI (18/09/2026). Une partie des récits repris de Facebook arrive
 *    en capitales : « PLAGE DE SABLE BLANC A MANAMBATO… ». Sur un téléphone,
 *    cinq lignes de capitales se lisent comme un cri et deux fois plus
 *    lentement qu'une phrase ordinaire — on ne distingue plus la forme des
 *    mots. Le fil les affichait telles quelles.
 *
 * ⚠ RIEN N'EST RÉÉCRIT EN BASE. `posts.body` garde le texte de son auteur ;
 *   seul ce qui est peint change.
 *
 * ⚠ ON NE TOUCHE QU'AUX PARAGRAPHES VRAIMENT EN CAPITALES : au moins 20 lettres,
 *   dont plus de 70 % de capitales. Un sigle (« RN7 », « ONG ») ou un nom de
 *   lieu en capitales au milieu d'une phrase normale ne franchit pas le seuil.
 *
 * ⚠ LES NOMS CONNUS RETROUVENT LEUR MAJUSCULE. Mettre en minuscules efface
 *   aussi celle des noms propres : « manambato ». L'appelant passe les noms
 *   qu'il connaît par une colonne (le lieu, le plat) et ils sont reposés tels
 *   quels. Les autres noms propres restent en minuscules : c'est le prix à
 *   payer, et il reste plus lisible que le cri.
 */

const SEUIL_LETTRES = 20;
const SEUIL_PART = 0.7;

/** Toujours reposés avec leur majuscule, où qu'ils soient. */
const NOMS_TOUJOURS = ["Madagascar"];

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enCapitales(ligne: string): boolean {
  const lettres = ligne.match(/\p{L}/gu);
  if (!lettres || lettres.length < SEUIL_LETTRES) return false;
  const capitales = lettres.filter((c) => /\p{Lu}/u.test(c)).length;
  return capitales / lettres.length > SEUIL_PART;
}

/** Majuscule en tête de ligne et après une fin de phrase suivie d'un blanc. */
function phrases(ligne: string): string {
  return ligne.replace(
    /(^|[.!?…]\s+)([^\p{L}\p{N}]*)(\p{L})/gu,
    (_, avant: string, ponctuation: string, lettre: string) =>
      avant + ponctuation + lettre.toLocaleUpperCase("fr")
  );
}

function reposerNoms(ligne: string, noms: string[]): string {
  let resultat = ligne;
  for (const nom of noms) {
    const propre = nom.trim();
    if (propre.length < 3) continue;
    const motif = new RegExp(`(^|[^\\p{L}])(${echapper(propre)})(?![\\p{L}])`, "giu");
    resultat = resultat.replace(motif, (_, avant: string) => avant + propre);
  }
  return resultat;
}

/**
 * Le texte, ligne à ligne, avec les paragraphes en capitales remis en casse
 * de phrase. Les lignes ordinaires ressortent à l'identique.
 */
export function adoucirCapitales(
  texte: string,
  noms: (string | null | undefined)[] = []
): string {
  if (!texte) return texte;
  const connus = [...NOMS_TOUJOURS, ...noms.filter((n): n is string => !!n)];
  return texte
    .split("\n")
    .map((ligne) =>
      enCapitales(ligne)
        ? reposerNoms(phrases(ligne.toLocaleLowerCase("fr")), connus)
        : ligne
    )
    .join("\n");
}
