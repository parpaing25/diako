/**
 * LA MÉMOIRE DU VISITEUR — ce qu'il regarde, pour le lui montrer d'abord.
 *
 * ⭐ POURQUOI (décision d'Andry, 03/09/2026) : « on se souvient de l'habitude
 *   de l'utilisateur, du lieu qu'il regarde, et on montre ça au premier fil,
 *   comme Instagram ». Le fil était purement chronologique : un visiteur qui
 *   venait de lire trois fiches sur Nosy Be retrouvait Tuléar en tête.
 *
 * Tout vit dans `localStorage`, côté client, sans compte : c'est le cas de
 * loin le plus fréquent (un membre inscrit pour des milliers de visiteurs).
 *  · `dk_affinites` : lieu → score, avec la date du dernier contact. Le score
 *    monte quand on ouvre une fiche de destination, qu'on réagit, qu'on
 *    enregistre, qu'on ouvre une publication. Il s'use avec le temps.
 *  · `dk_vus` : les publications déjà vues (7 jours). Elles reculent, elles ne
 *    disparaissent pas — on ne cache rien, on ordonne.
 *
 * ⚠ Le curseur du fil reste la DATE du dernier reçu, jamais le dernier
 *   affiché : réordonner à l'écran ne doit pas faire sauter une page.
 * ⚠ `localStorage` peut manquer (navigation privée) ou lever : chaque accès
 *   est enveloppé, et sans mémoire le fil reste simplement chronologique.
 */

const CLE_AFFINITES = "dk_affinites";
const CLE_VUS = "dk_vus";
const TTL_VUS_MS = 7 * 24 * 3600 * 1000;
const MAX_VUS = 3000;
const MAX_AFFINITES = 200;
/** Un score perd la moitié de sa valeur en trente jours sans contact. */
const DEMI_VIE_JOURS = 30;

type Affinites = Record<string, { s: number; t: number }>;
type Vus = Record<string, number>;

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = window.localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: unknown): void {
  try {
    window.localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* quota, navigation privée : on continue sans mémoire */
  }
}

function normaliser(nom: string | null | undefined): string {
  return (nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Marque un contact avec un lieu (slug ou nom). `poids` : 1 = croisé, 2 = ouvert, 3 = aimé. */
export function noterLieu(lieu: string | null | undefined, poids = 1): void {
  const cle = normaliser(lieu);
  if (!cle) return;
  const aff = lire<Affinites>(CLE_AFFINITES, {});
  const maintenant = Date.now();
  const actuel = aff[cle];
  const ancien = actuel ? actuel.s * Math.pow(0.5, (maintenant - actuel.t) / 86_400_000 / DEMI_VIE_JOURS) : 0;
  aff[cle] = { s: ancien + poids, t: maintenant };
  // On ne garde que les lieux les plus vivants.
  const cles = Object.keys(aff);
  if (cles.length > MAX_AFFINITES) {
    cles
      .sort((a, b) => aff[a].t - aff[b].t)
      .slice(0, cles.length - MAX_AFFINITES)
      .forEach((k) => delete aff[k]);
  }
  ecrire(CLE_AFFINITES, aff);
}

/** Le score courant d'un lieu, usé par le temps. 0 si inconnu. */
export function affinite(lieu: string | null | undefined): number {
  const cle = normaliser(lieu);
  if (!cle) return 0;
  const a = lire<Affinites>(CLE_AFFINITES, {})[cle];
  if (!a) return 0;
  return a.s * Math.pow(0.5, (Date.now() - a.t) / 86_400_000 / DEMI_VIE_JOURS);
}

/** Les lieux qui comptent le plus pour ce visiteur, du plus fort au plus faible. */
export function lieuxPreferes(n = 3): string[] {
  const aff = lire<Affinites>(CLE_AFFINITES, {});
  const maintenant = Date.now();
  return Object.entries(aff)
    .map(([k, v]) => [k, v.s * Math.pow(0.5, (maintenant - v.t) / 86_400_000 / DEMI_VIE_JOURS)] as const)
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Une publication a été vue (elle est restée à l'écran). */
export function noterVu(id: string): void {
  if (!id) return;
  const vus = lire<Vus>(CLE_VUS, {});
  const maintenant = Date.now();
  vus[id] = maintenant;
  const cles = Object.keys(vus).filter((k) => maintenant - vus[k] < TTL_VUS_MS);
  const propre: Vus = {};
  cles
    .sort((a, b) => vus[b] - vus[a])
    .slice(0, MAX_VUS)
    .forEach((k) => (propre[k] = vus[k]));
  ecrire(CLE_VUS, propre);
}

export function estVu(id: string): boolean {
  const t = lire<Vus>(CLE_VUS, {})[id];
  return typeof t === "number" && Date.now() - t < TTL_VUS_MS;
}

/**
 * Réordonne une page du fil : ce qui n'a pas été vu d'abord, et parmi cela ce
 * qui touche aux lieux que le visiteur regarde. À égalité, le plus récent.
 *
 * ⚠ La mémoire est lue UNE fois par appel (deux `localStorage.getItem`), pas
 *   une fois par publication : sur trente cartes, ça compte sur un Android
 *   d'entrée de gamme.
 */
export function reordonner<
  T extends { id: string; created_at: string; place_slug?: string | null; place?: string | null; dish?: string | null; page_name?: string | null },
>(posts: T[]): T[] {
  if (posts.length < 2) return posts;
  const aff = lire<Affinites>(CLE_AFFINITES, {});
  const vus = lire<Vus>(CLE_VUS, {});
  const maintenant = Date.now();
  if (Object.keys(aff).length === 0 && Object.keys(vus).length === 0) return posts;

  const score = (nom: string | null | undefined) => {
    const a = aff[normaliser(nom)];
    return a ? a.s * Math.pow(0.5, (maintenant - a.t) / 86_400_000 / DEMI_VIE_JOURS) : 0;
  };
  const note = (p: T) =>
    Math.max(score(p.place_slug), score(p.place)) + 0.5 * score(p.dish) + 0.5 * score(p.page_name);
  const vu = (p: T) => {
    const t = vus[p.id];
    return typeof t === "number" && maintenant - t < TTL_VUS_MS;
  };

  return [...posts]
    .map((p, i) => ({ p, i, vu: vu(p), n: note(p) }))
    .sort((a, b) => {
      if (a.vu !== b.vu) return a.vu ? 1 : -1;
      if (Math.abs(a.n - b.n) > 0.01) return b.n - a.n;
      // Ordre d'arrivée (chronologique) sinon.
      return a.i - b.i;
    })
    .map((x) => x.p);
}
