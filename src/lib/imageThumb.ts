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
export function jeuDeTailles(url: string | null | undefined): string | null {
  if (!url || !url.includes("/uploads/")) return null;
  const base = url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, "");
  const q = url.match(/(\?.*)$/)?.[1] ?? "";
  return [
    `${base}.thumb.webp${q} 480w`,
    `${base}.w960.webp${q} 960w`,
    `${base}.w1600.webp${q} 1600w`,
  ].join(", ");
}
