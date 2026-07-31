// Redimensionnement à la volée des images stockées sur Supabase Storage.
//
// Les avatars/couvertures sont uploadés en pleine résolution (souvent 300-400 Ko)
// mais affichés en 32-96 px → énorme gaspillage de data sur mobile 3G.
// L'endpoint « render/image » de Supabase redimensionne et re-compresse à la
// volée (et sert du WebP au navigateur qui le supporte). Exemple mesuré :
// un avatar de 389 Ko servi en 64×64 = 1,3 Ko (÷287).
//
// N'agit QUE sur les URLs Supabase Storage publiques ; toute autre URL
// (o2switch /uploads, dicebear, blob:, data:) est renvoyée telle quelle.

import { getThumbUrl } from '@/lib/imageThumb';

const OBJECT_PREFIX = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';

/**
 * REPLI de redimensionnement à la volée via un CDN d'images gratuit (weserv.nl),
 * pour les photos o2switch dont la vignette .thumb.webp n'a pas (encore) été
 * générée : au lieu de charger l'original de 300-500 Ko, on charge une version
 * WebP ~width px (÷10). N'est utilisé qu'en dernier recours (onError), donc
 * les images qui ont déjà leur vignette locale n'y passent jamais.
 * Renvoie l'URL d'origine si ce n'est pas une image http(s).
 */
export function getProxyThumb(url: string | null | undefined, width = 480, quality = 62): string {
  if (!url || !/^https?:\/\//i.test(url)) return url || '';
  const stripped = url.replace(/^https?:\/\//i, '');
  return `https://images.weserv.nl/?url=ssl:${stripped}&w=${width}&output=webp&q=${quality}`;
}

/**
 * Version allégée d'une PHOTO D'ANNONCE, quelle que soit sa source :
 *  - hébergée sur Supabase Storage  → redimensionnée à la volée (render/image) ;
 *  - hébergée sur o2switch (/uploads/) → vignette .thumb.webp existante ;
 *  - autre (blob:, data:, externe)   → renvoyée telle quelle.
 * Les anciennes annonces stockées sur Supabase pesaient 300-500 Ko l'image ;
 * cette route les ramène à quelques Ko. @param width largeur cible en px.
 */
export function getListingImage(url: string | null | undefined, width = 480, quality = 62): string {
  if (!url) return '';
  if (url.includes(OBJECT_PREFIX) && !url.includes(RENDER_PREFIX)) {
    const transformed = url.replace(OBJECT_PREFIX, RENDER_PREFIX);
    const sep = transformed.includes('?') ? '&' : '?';
    return `${transformed}${sep}width=${width}&quality=${quality}`;
  }
  // o2switch (ou autre) : on délègue à la logique de vignette existante.
  return getThumbUrl(url);
}

/**
 * Renvoie une version redimensionnée d'une image Supabase Storage.
 * @param url    URL d'origine
 * @param size   côté cible en px (carré ; on demande x2 pour les écrans HiDPI)
 * @param quality qualité JPEG/WebP (défaut 62)
 */
export function getAvatarUrl(url: string | null | undefined, size = 48, quality = 62): string {
  if (!url) return '';
  // Uniquement les objets publics Supabase Storage.
  if (!url.includes(OBJECT_PREFIX)) return url;
  // Déjà transformée ? on ne double pas.
  if (url.includes(RENDER_PREFIX)) return url;
  const px = Math.round(size * 2); // densité écran mobile (2x)
  const transformed = url.replace(OBJECT_PREFIX, RENDER_PREFIX);
  const sep = transformed.includes('?') ? '&' : '?';
  return `${transformed}${sep}width=${px}&height=${px}&resize=cover&quality=${quality}`;
}
