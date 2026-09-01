/**
 * PRÉCHARGEMENT D'UNE PAGE DÈS QUE L'INTENTION EST VISIBLE.
 *
 * Transcrit du projet frère, où le diagnostic a été fait en conditions réelles :
 * « la page agence se charge très long ». Ce n'étaient pas les données — la
 * requête était instantanée. C'était le CODE de la page qui arrivait tard.
 *
 * Chaque route est découpée à part (c'est voulu : ça allège l'accueil), mais
 * son fichier n'est demandé qu'au moment du clic. Et une requête vers o2switch
 * coûte environ 800 ms rien qu'en établissement de connexion — 250 ms de TCP,
 * 250 ms de TLS, mesurés. Puis le fichier révèle ses propres dépendances,
 * qu'il faut aller chercher à leur tour : deux à trois allers-retours APRÈS le
 * clic. D'où l'attente.
 *
 * On déclenche donc le téléchargement AU TOUCHER, avant même que le doigt ne
 * se relève. Ça ne coûte rien tant que personne ne vise le bouton, et au
 * moment du clic le code est déjà là.
 *
 * ⚠ On ne précharge PAS au démarrage : sur une 3G malgache, aller chercher des
 *   pages que personne n'a demandées concurrence l'affichage du fil et retarde
 *   l'accueil. C'est le même arbitrage que le découpage du bundle.
 */

/** import() est mis en cache par le navigateur ET par Vite : deux appels ne
 *  téléchargent qu'une fois. */
const ROUTES: Record<string, () => Promise<unknown>> = {
  "/explorer": () => import("@/pages/Explorer"),
  "/villes": () => import("@/pages/Villes"),
  "/recherche": () => import("@/pages/Recherche"),
  "/publier": () => import("@/pages/Publier"),
  "/pro": () => import("@/pages/EspacePro"),
  "/messages": () => import("@/pages/Messages"),
  "/notifications": () => import("@/pages/Notifications"),
  "/favoris": () => import("@/pages/Favoris"),
  "/compte": () => import("@/pages/Compte"),
  // ⚠ AJOUTEES APRES L'AUDIT : la table ne connaissait que 8 des 19 routes, et
  //   les 11 manquantes etaient precisement les pages recentes — celles dont
  //   le morceau n'est dans aucun cache et coute donc le plus cher a ouvrir.
  "/plats": () => import("@/pages/Plats"),
  "/gouts": () => import("@/pages/Gouts"),
  "/quand-partir": () => import("@/pages/QuandPartir"),
  "/y-aller": () => import("@/pages/YAller"),
  "/location": () => import("@/pages/Location"),
  "/circuits": () => import("@/pages/Circuits"),
  "/sites": () => import("@/pages/Sites"),
  "/evenements": () => import("@/pages/Evenements"),
  "/projet": () => import("@/pages/Projet"),
  "/guides": () => import("@/pages/Guides"),
  "/carte": () => import("@/pages/Carte"),
  "/parametres": () => import("@/pages/Parametres"),
};

const dejaDemandees = new Set<string>();

/** À brancher sur onPointerDown / onTouchStart d'un lien de navigation. */
export function prechargerRoute(chemin: string): void {
  const charger = ROUTES[chemin];
  if (!charger || dejaDemandees.has(chemin)) return;
  dejaDemandees.add(chemin);
  // Un échec de préchargement ne doit JAMAIS remonter : la navigation normale
  // rechargera le module de toute façon.
  charger().catch(() => dejaDemandees.delete(chemin));
}

/** Les fiches d'établissement partagent un seul module : un toucher suffit. */
export function prechargerFiche(): void {
  if (dejaDemandees.has("/p")) return;
  dejaDemandees.add("/p");
  import("@/pages/PagePro").catch(() => dejaDemandees.delete("/p"));
}
