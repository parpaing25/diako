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
