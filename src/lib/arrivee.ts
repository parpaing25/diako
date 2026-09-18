/**
 * LES PAGES D'ARRIVÉE — /lieu/:slug et /site/:slug.
 *
 * ⚠ POURQUOI UN FICHIER À PART. Ce sont les deux pages vers lesquelles pointent
 *   les publications Facebook : on y arrive SANS compte, SANS historique, dans
 *   le navigateur intégré de Facebook, sur un Android d'entrée de gamme. Les
 *   petites décisions qu'elles partagent (d'où vient-on, comment dire une durée
 *   ou une distance) vivent donc ici, en un seul exemplaire, pour que les deux
 *   pages ne disent pas la même chose de deux façons.
 */

/** L'adresse publique du site : l'URL de partage doit être absolue et canonique. */
export const SITE_URL = "https://diako.fonenako.mg";

/**
 * Vrai quand on est arrivé sur cette page depuis une AUTRE page du site.
 *
 * ⚠ Même test que `useRetour` : React Router tient dans `history.state.idx`
 *   l'index de l'entrée courante dans SON historique. À 0, on est entré
 *   directement (lien Facebook, WhatsApp, favori) : un bouton « Retour » n'a
 *   alors rien derrière lui, et c'est une ligne d'accueil qu'il faut montrer.
 */
export function venuDuSite(): boolean {
  if (typeof window === "undefined") return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return idx > 0;
}

/**
 * « d'Antananarivo », « d'Isalo », « de Tuléar » — l'élision devant une voyelle.
 *
 * ⚠ PAS DEVANT UN H, comme `autourDe` de Carte.tsx : aucune règle mécanique ne
 *   tranche entre h muet et h aspiré sur un nom propre, et en malgache le h se
 *   PRONONCE — « de Hell-Ville » est juste. Deux pages qui éliseraient
 *   différemment le même nom se contrediraient sous les yeux du lecteur.
 * ⚠ ON TESTE LA LETTRE DE BASE, après décomposition : « Éboulis » commence par
 *   un E, et une classe de caractères accentués écrite à la main se corrompt au
 *   premier outil qui relit le fichier dans un autre encodage.
 */
export function de(nom: string): string {
  const n = nom.trim();
  return /^[aeiouy]/i.test(n.normalize("NFD")) ? `d'${n}` : `de ${n}`;
}

/**
 * Une durée de trajet, lisible et sans décimale : 0,3 h → « 20 min »,
 * 2,5 h → « 2 h 30 », 8 h → « 8 h ».
 *
 * ⚠ ARRONDIE AUX CINQ MINUTES. La base stocke des heures décimales (« 1.5 ») ;
 *   « 1,5 h » se lit mal et « 1 h 48 » prétendrait à une précision que personne
 *   n'a mesurée sur une piste.
 */
export function dureeLisible(heures: number | string | null | undefined): string | null {
  if (heures === null || heures === undefined || heures === "") return null;
  const h = Number(heures);
  if (!Number.isFinite(h) || h <= 0) return null;
  const minutes = Math.max(5, Math.round((h * 60) / 5) * 5);
  if (minutes < 60) return `${minutes} min`;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`;
}

/**
 * Une distance d'adresse proche : « moins de 1 km » sous le kilomètre, sinon
 * arrondie au kilomètre. `null` quand elle n'est pas connue — jamais « 0 km ».
 */
export function distanceArrondie(km: number | string | null | undefined): string | null {
  if (km === null || km === undefined || km === "") return null;
  const d = Number(km);
  if (!Number.isFinite(d) || d < 0) return null;
  return d < 1 ? "moins de 1 km" : `${Math.round(d)} km`;
}

/**
 * Majuscule initiale à l'affichage : un résumé Wikidata commence souvent par
 * une minuscule (« lac malgache »), ce qui se lit comme une phrase tronquée.
 */
export function majuscule(t: string): string {
  const s = t.trim();
  return s ? s.charAt(0).toLocaleUpperCase("fr-FR") + s.slice(1) : s;
}

/**
 * Le lien vers la carte, centré sur un point.
 *
 * ⚠ `/carte` lit `lat`, `lng` et `z` depuis le 18/09/2026, et `familles` depuis
 *   toujours (codes de `src/lib/carte.ts` : dormir, manger, plage, nature,
 *   sommet, culture, service). Le paramètre `lieu=` qu'on envoyait avant était
 *   ignoré : la carte s'ouvrait sur tout Madagascar.
 */
export function lienCarte(lat: number, lng: number, familles?: string[], z = 12): string {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng), z: String(z) });
  if (familles && familles.length > 0) p.set("familles", familles.join(","));
  return `/carte?${p.toString()}`;
}
