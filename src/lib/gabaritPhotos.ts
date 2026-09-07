import type { Media } from "@/lib/api";

/**
 * LE GABARIT D'UNE PUBLICATION — c'est la photo qui le dicte, jamais l'inverse.
 *
 * 🔴 CE QUE ÇA CORRIGE. Le fil précédent imposait à chaque photo un créneau
 *    plein écran de 390 × 788 px CSS, soit 780 × 1576 pixels réels. Or la photo
 *    médiane du corpus fait 590 × 443 et 424 photos sur 500 sont en PAYSAGE
 *    (recompté en base le 06/09/2026). En `object-fit: cover`, un créneau
 *    portrait sur une photo paysage donne **3,56× d'agrandissement et 33 % de
 *    la photo encore visible** : c'est le « ça zoome et ça pixellise ».
 *
 * LA RÈGLE, à 390 px d'écran (colonne de 358 px CSS, 716 pixels réels à
 * demander sur un écran de densité 2) :
 *
 *   · une photo   -> pleine colonne à son ratio naturel. 0 % de recadrage.
 *                    590 px de large -> 716/590 = 1,21×. 810 px -> 0,88×.
 *   · deux photos -> côte à côte, alignées sur le ratio le plus ÉTROIT des
 *                    deux. Chaque case : 178 px CSS -> 356/590 = 0,60×.
 *   · trois et +  -> une grande, puis une planche contact de deux à quatre.
 *                    Les cases descendent à 88 px CSS -> 0,36× sur la vignette.
 *
 * ⚠ ALIGNER SUR LE RATIO LE PLUS ÉTROIT, jamais sur une moyenne : la moyenne
 *   recadre les DEUX photos, le minimum n'en recadre qu'une.
 * ⚠ Une vidéo sort de cette règle et repart au carrousel : elle a ses propres
 *   commandes, et son gabarit n'est pas celui d'une photo.
 */
export type Gabarit =
  | { forme: "aucune" }
  | { forme: "video"; media: Media[] }
  | { forme: "une"; grande: Media }
  | { forme: "duo"; a: Media; b: Media; ratio: number }
  | { forme: "planche"; grande: Media; suite: Media[]; ratio: number };

/** Le ratio d'une photo, 3:2 quand la base ne l'a pas enregistré. */
export const ratioDe = (m: Media) => (m.w && m.h ? m.w / m.h : 3 / 2);

export function gabarit(media: Media[] | null | undefined): Gabarit {
  const tout = media ?? [];
  if (tout.length === 0) return { forme: "aucune" };
  if (tout.some((m) => m.type === "video")) return { forme: "video", media: tout };

  if (tout.length === 1) return { forme: "une", grande: tout[0] };
  if (tout.length === 2) {
    return { forme: "duo", a: tout[0], b: tout[1], ratio: Math.min(ratioDe(tout[0]), ratioDe(tout[1])) };
  }
  const suite = tout.slice(1, 5); // au plus quatre vignettes sous la grande
  return { forme: "planche", grande: tout[0], suite, ratio: Math.min(...suite.map(ratioDe)) };
}

/**
 * Le recadrage subi par une photo posée dans une case d'un ratio donné, en part
 * de surface perdue. Sert aux tests : le projet se donne 25 % de plafond.
 */
export function recadrage(m: Media, ratioCase: number): number {
  const r = ratioDe(m);
  return 1 - Math.min(r, ratioCase) / Math.max(r, ratioCase);
}
