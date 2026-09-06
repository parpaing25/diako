// Miniatures (vignettes) des images d'annonces.
// Une vignette WebP ~480px est générée à l'upload à côté de l'original,
// avec le suffixe ".thumb.webp" (ex : uploads/listings/xxx/123.jpg -> 123.thumb.webp).
// Sur les cartes (feed), on charge la vignette (÷8-10 en poids) ; si elle n'existe
// pas encore (images d'avant), le <img onError> retombe sur l'original.

// Ne transforme QUE nos images o2switch (chemin /uploads/). Les URL externes/blob restent inchangées.
export function getThumbUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (!url.includes('/uploads/')) return url;
  // remplace l'extension image par .thumb.webp (en préservant un éventuel ?query)
  return url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, '.thumb.webp$2');
}

/**
 * LES TROIS TAILLES, pour un `srcset` honnête.
 *
 * 🔴 IL N'Y AVAIT QU'UNE VIGNETTE, À 480 px. Entre elle et l'original (jusqu'à
 *    2000 px), rien. Une couverture de fiche fait 800 px : elle devait donc
 *    prendre l'ORIGINAL, ~730 Ko pour occuper 800 px. C'est de là que venaient
 *    à la fois la lenteur ET le flou — trop petit, ou beaucoup trop gros,
 *    jamais la bonne taille.
 *
 * ⚠ ON NE DEVINE PAS L'EXISTENCE DES VARIANTES. Les images posées avant ce
 *   changement n'ont que la vignette 480 : annoncer un `1600w` qui rend 404
 *   ferait afficher un cadre vide. Le `srcset` ne liste donc que 480 et
 *   l'original, sauf quand l'appelant sait que les variantes existent.
 */
export function jeuDeTailles(
  url: string | null | undefined,
  w?: number,
  h?: number
): string | null {
  if (!url || !url.includes("/uploads/")) return null;
  const base = url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, "");
  const q = url.match(/(\?.*)$/)?.[1] ?? "";

  /* 🔴 LE `srcset` ANNONCAIT DES PIXELS QUI N'EXISTENT PAS. Il déclarait
     `960w` et `1600w` quelle que soit la photo. Or `o2upload.php:42` ne
     fabrique JAMAIS plus grand que la source : `$scale = min(1, $maxDim /
     max($w, $h))`. Une photo de 590 px donne donc trois fichiers de 480, 590
     et 590 px — et le navigateur, croyant disposer de 1600 px de détail,
     choisissait la plus grosse pour un grand créneau puis l'agrandissait.
     Mesuré le 06/09/2026 sur la production : `01.w960.webp` du récit de
     Manambato fait 590 × 443, pas 960 de large.

     On calcule donc la largeur RÉELLE de chaque variante avec la même formule
     que le serveur — le plafond porte sur le PLUS GRAND CÔTÉ, ce qui change
     tout pour une photo en portrait — et deux variantes qui rendent le même
     fichier ne sont plus annoncées deux fois.

     ⚠ Sans `w` et `h`, on ne peut pas savoir : on garde alors l'ancien
     comportement, faute de mieux. Les appelants du fil, eux, les ont
     (`media[].w` et `.h` sont stockés à la publication). */
  const largeurReelle = (cote: number) =>
    w && h ? Math.max(1, Math.round(w * Math.min(1, cote / Math.max(w, h)))) : cote;

  const vues = new Set<number>();
  const sorties: string[] = [];
  for (const [fichier, cote] of [
    [`${base}.thumb.webp${q}`, 480],
    [`${base}.w960.webp${q}`, 960],
    [`${base}.w1600.webp${q}`, 1600],
  ] as [string, number][]) {
    const reelle = largeurReelle(cote);
    if (vues.has(reelle)) continue;
    vues.add(reelle);
    sorties.push(`${fichier} ${reelle}w`);
  }
  return sorties.join(", ");
}
