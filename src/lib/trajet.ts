/**
 * PLANIFICATEUR DE TRAJET — le calcul, sans React et sans Supabase.
 *
 * ⚠ CE FICHIER N'INVENTE RIEN, ET C'EST SA RAISON D'ÊTRE. Il ne connaît qu'une
 *   chose : les 42 tronçons relevés de `place_access`. Il les met bout à bout,
 *   il les additionne, il compare le total au coucher du soleil. Il ne comble
 *   aucun trou. Un tronçon absent du relevé n'est pas estimé « au kilométrage » :
 *   la paire est déclarée non couverte, et l'écran le dit.
 *
 *   Le mobile est direct : une durée inventée fait partir quelqu'un trop tard,
 *   et rouler de nuit sur une piste malgache est le risque que ce chantier
 *   existe pour éviter. Mieux vaut « nous n'avons pas relevé ce tronçon » qu'un
 *   nombre plausible.
 *
 * ⚠ LES DEUX SEULES CHOSES CALCULÉES ICI LE SONT À PARTIR DE FAITS, pas de
 *   moyennes de confort :
 *     · la somme des durées relevées → heure d'arrivée ;
 *     · la position du Soleil pour les coordonnées du lieu → heure du coucher.
 *   Aucune durée de pause, aucune vitesse théorique, aucun « comptez large »
 *   n'entre dans le total. Le total est donc un PLANCHER, et l'écran le dit.
 *
 * ⚠ AUCUN IMPORT. Le fichier reste compilable seul, ce qui permet de le vérifier
 *   hors application (voir docs/chantiers/planificateur.md § vérifications).
 */

/* ────────────────────────────────────────────────────────────────────────────
 * RÉGLAGES — les deux seuls chiffres en dur, et ce sont des faits
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Madagascar vit à UTC+3 (East Africa Time) toute l'année, sans heure d'été.
 * Ce n'est pas un réglage : c'est le fuseau du pays. On ne passe surtout pas
 * par l'heure du navigateur — la moitié des visiteurs préparent leur voyage
 * depuis l'Europe, et leur montre ne dit pas quand la nuit tombe à Ihosy.
 */
export const FUSEAU_MADAGASCAR_H = 3;

/**
 * LE RELEVÉ EST ORIENTÉ : il existe « Antananarivo → Toliara », jamais
 * l'inverse. Refuser le sens inverse ramène la couverture de 1 642 paires à
 * 143 et rend l'outil muet sur tous les retours — c'est-à-dire la moitié des
 * trajets réels.
 *
 * ⚠ On l'autorise donc, MAIS chaque tronçon parcouru à rebours porte
 *   `sensInverse: true` et l'interface l'affiche : la distance est celle de la
 *   même route, la durée est celle relevée dans l'AUTRE sens. Rien n'est
 *   fabriqué, rien n'est « ajusté pour la montée » — la réutilisation est
 *   nommée à l'écran.
 *
 *   Passer cette constante à `false` restreint le planificateur au sens exact
 *   du relevé ; l'écran annonce alors tout seul la couverture réduite.
 */
export const AUTORISER_SENS_INVERSE = true;

/* ────────────────────────────────────────────────────────────────────────────
 * LE RÉFÉRENTIEL, TEL QU'IL SORT DE LA BASE
 * ──────────────────────────────────────────────────────────────────────── */

export interface Lieu {
  slug: string;
  nom: string;
  region: string | null;
  kind: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * Adresses publiées rattachées à ce lieu. Ce n'est pas de la décoration :
   * c'est ce qui distingue « on peut dormir ici » de « on ne peut pas ».
   * Ambalavao en compte 4, Zombitse aucune, et le second cas est celui qu'il
   * faut absolument voir avant de choisir où couper sa journée.
   */
  nbHotels: number | null;
  nbRestaurants: number | null;
}

/** Une ligne de `place_access`, sans transformation. */
export interface Acces {
  depuis: string;
  vers: string;
  mode: string;
  km: number | null;
  heures: number | null;
  etat: string | null;
  toute_annee: boolean;
  operateurs: string[] | null;
  prix_ar: number | null;
}

export interface Referentiel {
  lieux: Lieu[];
  acces: Acces[];
}

/** Un tronçon orienté dans le sens du parcours demandé. */
export interface Troncon {
  de: Lieu;
  vers: Lieu;
  mode: string;
  km: number | null;
  heures: number;
  etat: string | null;
  touteAnnee: boolean;
  operateurs: string[] | null;
  prixAr: number | null;
  /** Vrai quand le relevé porte sur le sens opposé (cf. AUTORISER_SENS_INVERSE). */
  sensInverse: boolean;
}

export interface Graphe {
  lieux: Map<string, Lieu>;
  sortants: Map<string, Troncon[]>;
  /** Numéro de composante connexe : deux lieux de numéros différents ne
   *  communiquent pas dans le relevé, et aucun itinéraire ne peut les joindre. */
  composante: Map<string, number>;
  /** Tronçons écartés du calcul faute de durée relevée — affichés tels quels. */
  sansDuree: Acces[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * CONSTRUCTION DU GRAPHE
 * ──────────────────────────────────────────────────────────────────────── */

export function construireGraphe(ref: Referentiel): Graphe {
  const lieux = new Map<string, Lieu>();
  for (const l of ref.lieux) lieux.set(l.slug, l);

  const sortants = new Map<string, Troncon[]>();
  const sansDuree: Acces[] = [];

  const pousser = (t: Troncon) => {
    const liste = sortants.get(t.de.slug);
    if (liste) liste.push(t);
    else sortants.set(t.de.slug, [t]);
  };

  for (const a of ref.acces) {
    const de = lieux.get(a.depuis);
    const vers = lieux.get(a.vers);
    if (!de || !vers) continue;

    // ⚠ SANS DURÉE RELEVÉE, LE TRONÇON NE SERT PAS À CALCULER UNE HEURE
    //   D'ARRIVÉE. On ne le remplace pas par une vitesse moyenne : ce serait
    //   exactement la donnée inventée que ce fichier refuse. Il est mis de côté
    //   et l'écran peut le mentionner.
    if (a.heures == null || a.heures <= 0) {
      sansDuree.push(a);
      continue;
    }

    const base = {
      mode: a.mode,
      km: a.km,
      heures: a.heures,
      etat: a.etat,
      touteAnnee: a.toute_annee,
      operateurs: a.operateurs,
      prixAr: a.prix_ar,
    };
    pousser({ ...base, de, vers, sensInverse: false });
    if (AUTORISER_SENS_INVERSE) pousser({ ...base, de: vers, vers: de, sensInverse: true });
  }

  return { lieux, sortants, composante: composantes(lieux, sortants), sansDuree };
}

/**
 * Les composantes se calculent TOUJOURS sur le graphe non orienté, même quand
 * le sens inverse est interdit : servir « aucun itinéraire » et « ces deux
 * lieux ne se rejoignent nulle part dans le relevé » sont deux messages
 * différents, et le second est le seul qui apprenne quelque chose au visiteur.
 */
function composantes(
  lieux: Map<string, Lieu>,
  sortants: Map<string, Troncon[]>
): Map<string, number> {
  const voisins = new Map<string, string[]>();
  const relier = (a: string, b: string) => {
    const v = voisins.get(a);
    if (v) v.push(b);
    else voisins.set(a, [b]);
  };
  for (const liste of sortants.values())
    for (const t of liste) {
      relier(t.de.slug, t.vers.slug);
      relier(t.vers.slug, t.de.slug);
    }

  const numero = new Map<string, number>();
  let n = 0;
  for (const slug of lieux.keys()) {
    if (numero.has(slug)) continue;
    n += 1;
    const pile = [slug];
    numero.set(slug, n);
    while (pile.length) {
      const x = pile.pop() as string;
      for (const y of voisins.get(x) ?? [])
        if (!numero.has(y)) {
          numero.set(y, n);
          pile.push(y);
        }
    }
  }
  return numero;
}

/** Les lieux que l'on peut proposer dans les deux champs : ceux du relevé. */
export function lieuxProposables(g: Graphe): Lieu[] {
  return [...g.lieux.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/* ────────────────────────────────────────────────────────────────────────────
 * RECHERCHE D'ITINÉRAIRE — Dijkstra sur les DURÉES RELEVÉES
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * On minimise les heures, pas les kilomètres : c'est tout le propos du relevé.
 * Sur la RN7, la somme des sept tronçons (941 km, 19,5 h) est plus courte que
 * la ligne « Antananarivo → Toliara » prise d'un bloc (950 km, 20 h) — et c'est
 * la version découpée qu'il faut, parce qu'elle seule dit où s'arrêter dormir.
 *
 * ⚠ Départage TOTAL : durée, puis nombre de tronçons, puis slug. Sans le
 *   dernier critère, deux itinéraires de même durée pourraient s'échanger d'un
 *   affichage à l'autre — un planificateur qui change d'avis n'est pas cru.
 *
 * File linéaire assumée : 43 sommets, 84 arcs. Un tas binaire serait de la
 * cérémonie pour trois microsecondes.
 */
export function chercherItineraire(
  g: Graphe,
  departSlug: string,
  arriveeSlug: string
): Troncon[] | null {
  if (departSlug === arriveeSlug) return null;
  if (!g.lieux.has(departSlug) || !g.lieux.has(arriveeSlug)) return null;

  const cout = new Map<string, number>([[departSlug, 0]]);
  const sauts = new Map<string, number>([[departSlug, 0]]);
  const venantDe = new Map<string, Troncon>();
  const fige = new Set<string>();

  for (;;) {
    let courant: string | null = null;
    for (const [slug, c] of cout) {
      if (fige.has(slug)) continue;
      if (courant === null) {
        courant = slug;
        continue;
      }
      const cc = cout.get(courant) as number;
      const sc = sauts.get(courant) as number;
      const ss = sauts.get(slug) as number;
      if (c < cc || (c === cc && (ss < sc || (ss === sc && slug < courant)))) courant = slug;
    }
    if (courant === null) break;
    if (courant === arriveeSlug) break;
    fige.add(courant);

    const depuis = cout.get(courant) as number;
    const sautsDepuis = sauts.get(courant) as number;
    for (const t of g.sortants.get(courant) ?? []) {
      if (fige.has(t.vers.slug)) continue;
      const neuf = depuis + t.heures;
      const neufSauts = sautsDepuis + 1;
      const connu = cout.get(t.vers.slug);
      const connuSauts = sauts.get(t.vers.slug);
      const mieux =
        connu === undefined ||
        neuf < connu - 1e-9 ||
        (Math.abs(neuf - connu) < 1e-9 && neufSauts < (connuSauts as number));
      if (mieux) {
        cout.set(t.vers.slug, neuf);
        sauts.set(t.vers.slug, neufSauts);
        venantDe.set(t.vers.slug, t);
      }
    }
  }

  if (!venantDe.has(arriveeSlug)) return null;
  const chemin: Troncon[] = [];
  let slug = arriveeSlug;
  while (slug !== departSlug) {
    const t = venantDe.get(slug);
    if (!t) return null;
    chemin.unshift(t);
    slug = t.de.slug;
  }
  return chemin;
}

/**
 * Le tronçon relevé d'un seul tenant entre les deux extrémités, s'il existe.
 * Sert de CONTRE-VÉRIFICATION affichée : quand le relevé porte à la fois la
 * ligne directe et ses morceaux, montrer les deux totaux côte à côte prouve au
 * visiteur qu'on n'a rien bricolé (950 km / 20 h contre 941 km / 19,5 h).
 */
export function releveDirect(g: Graphe, departSlug: string, arriveeSlug: string): Troncon | null {
  const direct = (g.sortants.get(departSlug) ?? []).filter((t) => t.vers.slug === arriveeSlug);
  if (!direct.length) return null;
  return direct.find((t) => !t.sensInverse) ?? direct[0];
}

/* ────────────────────────────────────────────────────────────────────────────
 * LE SOLEIL — position calculée, jamais tabulée
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * ⚠ AUCUNE HEURE DE COUCHER N'EST STOCKÉE NULLE PART. Elles sont calculées par
 *   l'algorithme solaire du NOAA à partir des coordonnées RÉELLES du lieu
 *   (`places.lat` / `places.lng`) et de la date choisie. Une table d'horaires
 *   saisie à la main serait une donnée inventée de plus, fausse de vingt
 *   minutes entre Antsiranana et Toliara — 13 degrés de latitude d'écart.
 *
 * ⚠ UN LIEU SANS COORDONNÉES NE REÇOIT PAS D'HORAIRE APPROCHÉ. La fonction rend
 *   `null` et l'écran affiche « coucher du soleil inconnu ici ». Trois lieux du
 *   relevé sont dans ce cas.
 */
export interface Soleil {
  /** Minutes depuis minuit, heure de Madagascar. */
  leverMin: number;
  coucherMin: number;
  /** Fin du crépuscule civil : au-delà, on ne distingue plus le bas-côté. */
  nuitMin: number;
}

const RAD = Math.PI / 180;

/** Jour julien à 0 h TU pour une date ISO. Fliegel–Van Flandern, grégorien. */
function jourJulien(dateISO: string): number {
  const [a, m, j] = dateISO.split("-").map(Number);
  let annee = a;
  let mois = m;
  if (mois <= 2) {
    annee -= 1;
    mois += 12;
  }
  const siecle = Math.floor(annee / 100);
  const correction = 2 - siecle + Math.floor(siecle / 4);
  return (
    Math.floor(365.25 * (annee + 4716)) +
    Math.floor(30.6001 * (mois + 1)) +
    j +
    correction -
    1524.5
  );
}

function positionSolaire(jd: number) {
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const longApparente =
    L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * RAD);
  const obliquiteMoyenne =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliquite = obliquiteMoyenne + 0.00256 * Math.cos((125.04 - 1934.136 * T) * RAD);
  const declinaison =
    Math.asin(Math.sin(obliquite * RAD) * Math.sin(longApparente * RAD)) / RAD;
  const y = Math.tan((obliquite / 2) * RAD) ** 2;
  const equationDuTemps =
    (4 *
      (y * Math.sin(2 * L0 * RAD) -
        2 * e * Math.sin(M * RAD) +
        4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
        0.5 * y * y * Math.sin(4 * L0 * RAD) -
        1.25 * e * e * Math.sin(2 * M * RAD))) /
    RAD;
  return { declinaison, equationDuTemps };
}

export function soleil(lat: number | null, lng: number | null, dateISO: string): Soleil | null {
  if (lat == null || lng == null) return null;
  const { declinaison, equationDuTemps } = positionSolaire(jourJulien(dateISO));
  const midiSolaire = 720 - 4 * lng - equationDuTemps + FUSEAU_MADAGASCAR_H * 60;

  const angleHoraire = (zenith: number): number | null => {
    const c =
      Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(declinaison * RAD)) -
      Math.tan(lat * RAD) * Math.tan(declinaison * RAD);
    // Hors [-1,1] : le Soleil ne franchit pas ce seuil ce jour-là. N'arrive pas
    // à Madagascar (12°S–26°S), mais on refuse de rendre un nombre faux.
    if (c < -1 || c > 1) return null;
    return Math.acos(c) / RAD;
  };

  const haJour = angleHoraire(90.833);
  const haNuit = angleHoraire(96);
  if (haJour == null) return null;

  return {
    leverMin: midiSolaire - 4 * haJour,
    coucherMin: midiSolaire + 4 * haJour,
    nuitMin: haNuit == null ? midiSolaire + 4 * haJour : midiSolaire + 4 * haNuit,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DATES ET HEURES — arithmétique pure, jamais l'horloge du navigateur
 * ──────────────────────────────────────────────────────────────────────── */

/** Aujourd'hui à Madagascar, quel que soit le fuseau de celui qui consulte. */
export function aujourdhuiMadagascar(maintenant: Date = new Date()): string {
  const decale = new Date(maintenant.getTime() + FUSEAU_MADAGASCAR_H * 3600_000);
  return decale.toISOString().slice(0, 10);
}

export function decalerDate(dateISO: string, jours: number): string {
  // Midi TU en pivot : à minuit, un arrondi de milliseconde peut faire changer
  // le quantième dans certains moteurs.
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function dateEnFrancais(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** « 17 h 38 ». Les minutes fractionnaires sont arrondies, jamais tronquées. */
export function heureFr(minutes: number): string {
  const m = Math.round(((minutes % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")}`;
}

/** « 3 h 30 », « 45 min ». Une durée n'est pas une heure : pas de zéro devant. */
export function dureeFr(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${String(r).padStart(2, "0")}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * LE PLAN
 * ──────────────────────────────────────────────────────────────────────── */

export interface Etape {
  troncon: Troncon;
  /** Minutes depuis minuit du jour 1 : l'instant absolu, jours compris. */
  departAbs: number;
  arriveeAbs: number;
  /** Soleil au point d'ARRIVÉE, à la date d'arrivée. `null` si sans coordonnées. */
  soleil: Soleil | null;
  /** Vrai si l'on débarque après le coucher du soleil. */
  arriveeDeNuit: boolean;
  /**
   * Vrai si le tronçon ENJAMBE un coucher de soleil — on roule donc dans le
   * noir, même quand l'arrivée elle-même tombe de jour.
   *
   * ⚠ Sans ce test, un Antananarivo → Antsiranana de 24 h parti à 6 h et arrivé
   *   à 6 h le lendemain serait déclaré « arrivée de jour » : rigoureusement
   *   vrai, et le pire conseil possible.
   *
   * ⚠ Le coucher retenu est celui du point d'ARRIVÉE. Un tronçon est une seule
   *   ligne de relevé : on ne connaît aucune position intermédiaire, et en
   *   fabriquer une serait inventer.
   */
  traverseLaNuit: boolean;
}

/**
 * L'heure à laquelle il aurait fallu partir pour se poser avant la nuit.
 * Purement dérivée du coucher et de la durée relevée — aucune marge ajoutée.
 * `null` quand on ne sait pas dater le coucher au point d'arrivée.
 */
export function heureLimiteDeDepart(e: Etape): number | null {
  if (!e.soleil) return null;
  return e.soleil.coucherMin - e.troncon.heures * 60;
}

export interface Journee {
  numero: number;
  /** Date à laquelle la journée COMMENCE. */
  dateISO: string;
  /** Date à laquelle elle se termine : un tronçon de 24 h déborde. */
  dateArriveeISO: string;
  etapes: Etape[];
  /** Là où l'on passe la nuit (ou le terme du voyage, le dernier jour). */
  arriveeSur: Lieu;
  debutAbs: number;
  arriveeAbs: number;
  soleil: Soleil | null;
  /**
   * Vrai quand la journée se termine après le coucher du soleil ALORS QU'AUCUN
   * arrêt plus tôt n'existe dans le relevé — c'est-à-dire quand le tronçon est
   * insécable. On ne masque pas le cas : on le nomme.
   */
  nuitSubie: boolean;
}

export interface Plan {
  depart: Lieu;
  arrivee: Lieu;
  troncons: Troncon[];
  /** Somme des durées relevées, en heures. C'est un PLANCHER : zéro pause. */
  heuresTotal: number;
  /** Somme des distances relevées ; `null` si l'une d'elles manque. */
  kmTotal: number | null;
  /** La ligne « d'un seul tenant » du relevé, quand elle existe aussi. */
  direct: Troncon | null;
  /** Sans jamais s'arrêter : l'instant d'arrivée, et ce qu'il vaut. */
  traite: {
    arriveeAbs: number;
    dateISO: string;
    soleil: Soleil | null;
    /**
     * Vrai dès qu'on roule dans le noir : soit l'arrivée tombe après le coucher
     * du soleil, soit le trajet passe un minuit — donc traverse une nuit
     * entière. Ne regarder que l'instant d'arrivée déclarerait « pas de nuit »
     * un Antananarivo → Antsiranana de 24 h arrivant à 6 h du matin.
     */
    deNuit: boolean;
    /** Nombre de minuits franchis : 0 = arrivée le jour même. */
    nuits: number;
    /** Vrai si l'arrivée n'a pas de coordonnées : on ne SAIT pas, on ne rassure pas. */
    soleilInconnu: boolean;
    /** Minutes écoulées depuis le coucher du soleil à l'arrivée. */
    retardSurLeSoleilMin: number | null;
  };
  /** Le même trajet découpé pour ne pas rouler après la tombée de la nuit. */
  journees: Journee[];
  /** Tronçons dont le relevé dit qu'ils ne sont pas praticables toute l'année. */
  saisonniers: Troncon[];
  /** Lieux de l'itinéraire sans coordonnées : on n'y sait pas l'heure du soleil. */
  sansCoordonnees: Lieu[];
}

export interface DemandeDePlan {
  departSlug: string;
  arriveeSlug: string;
  dateISO: string;
  /** Heure de départ le premier jour, en minutes depuis minuit. */
  departMin: number;
  /**
   * Heure à laquelle on repart les jours suivants. C'est un CHOIX de la
   * personne, pas une donnée du référentiel : il est affiché comme tel et
   * modifiable. Par défaut, la même heure que le premier jour.
   */
  matinMin: number;
}

export type Echec =
  | { type: "meme-lieu" }
  | { type: "inconnu"; slug: string }
  | { type: "composantes-separees"; depart: Lieu; arrivee: Lieu }
  | { type: "sans-chemin"; depart: Lieu; arrivee: Lieu };

/**
 * ⚠ LA RÈGLE DU DÉCOUPAGE : on ferme la journée AU DERNIER LIEU ATTEIGNABLE
 *   AVANT LE COUCHER DU SOLEIL. Le calcul est fait tronçon par tronçon, avec le
 *   soleil du lieu d'arrivée et la date du jour en cours — pas une heure
 *   moyenne pour tout le pays.
 *
 * ⚠ ON NE COUPE JAMAIS UN TRONÇON. Le relevé donne « Antananarivo → Morondava,
 *   700 km, 14 h » d'un seul bloc : il n'existe aucun point intermédiaire à
 *   proposer, donc aucun arrêt n'est inventé sur la RN34. La journée est alors
 *   marquée `nuitSubie` et l'écran écrit que le tronçon est insécable en
 *   l'état du relevé. C'est la seule réponse honnête.
 *
 * ⚠ UN LIEU SANS COORDONNÉES N'EST PAS UN POINT DE DÉCISION. Sans elles on ne
 *   sait pas quand le soleil s'y couche ; en faire une étape de nuit
 *   reviendrait à parier. On poursuit jusqu'au premier lieu qu'on sait dater.
 */
function enjambeUnCoucher(
  arriveeSur: Lieu,
  dateISO: string,
  departAbs: number,
  arriveeAbs: number
): boolean {
  for (let j = Math.floor(departAbs / 1440); j <= Math.floor(arriveeAbs / 1440); j += 1) {
    const s = soleil(arriveeSur.lat, arriveeSur.lng, decalerDate(dateISO, j));
    if (!s) continue;
    const coucher = j * 1440 + s.coucherMin;
    if (coucher > departAbs && coucher < arriveeAbs) return true;
  }
  return false;
}

export function planifier(g: Graphe, d: DemandeDePlan): Plan | Echec {
  if (d.departSlug === d.arriveeSlug) return { type: "meme-lieu" };
  const depart = g.lieux.get(d.departSlug);
  const arrivee = g.lieux.get(d.arriveeSlug);
  if (!depart) return { type: "inconnu", slug: d.departSlug };
  if (!arrivee) return { type: "inconnu", slug: d.arriveeSlug };

  const troncons = chercherItineraire(g, d.departSlug, d.arriveeSlug);
  if (!troncons) {
    const ca = g.composante.get(d.departSlug);
    const cb = g.composante.get(d.arriveeSlug);
    return ca !== undefined && cb !== undefined && ca !== cb
      ? { type: "composantes-separees", depart, arrivee }
      : { type: "sans-chemin", depart, arrivee };
  }

  const heuresTotal = troncons.reduce((s, t) => s + t.heures, 0);
  const kmTotal = troncons.some((t) => t.km == null)
    ? null
    : troncons.reduce((s, t) => s + (t.km as number), 0);

  /* ── Sans s'arrêter ─────────────────────────────────────────────────── */
  const arriveeAbs = d.departMin + heuresTotal * 60;
  const jourArrivee = Math.floor(arriveeAbs / 1440);
  const dateArrivee = decalerDate(d.dateISO, jourArrivee);
  const soleilArrivee = soleil(arrivee.lat, arrivee.lng, dateArrivee);
  const minuteArrivee = arriveeAbs - jourArrivee * 1440;
  const deNuitTraite =
    jourArrivee >= 1 ||
    (soleilArrivee != null &&
      (minuteArrivee > soleilArrivee.coucherMin || minuteArrivee < soleilArrivee.leverMin));

  /* ── En s'arrêtant dormir ───────────────────────────────────────────── */
  const journees: Journee[] = [];
  /** Quantième du jour où la journée en cours a COMMENCÉ. */
  let jourDebut = 0;
  let horloge = d.departMin;
  let etapes: Etape[] = [];
  let nuitSubie = false;

  const clore = (arriveeSur: Lieu, soleilFin: Soleil | null, subie: boolean) => {
    journees.push({
      numero: journees.length + 1,
      dateISO: decalerDate(d.dateISO, jourDebut),
      dateArriveeISO: decalerDate(d.dateISO, Math.floor(horloge / 1440)),
      etapes,
      arriveeSur,
      debutAbs: etapes.length ? etapes[0].departAbs : horloge,
      arriveeAbs: horloge,
      soleil: soleilFin,
      nuitSubie: subie,
    });
    etapes = [];
    nuitSubie = false;
  };

  for (let i = 0; i < troncons.length; i += 1) {
    const t = troncons[i];
    let arriveeEtape = horloge + t.heures * 60;
    let jourEtape = Math.floor(arriveeEtape / 1440);
    let s = soleil(t.vers.lat, t.vers.lng, decalerDate(d.dateISO, jourEtape));
    let apresCoucher =
      s != null && arriveeEtape - jourEtape * 1440 > s.coucherMin;

    // On sait dater l'arrivée ET elle tombe après le coucher : si la journée
    // porte déjà au moins un tronçon, on s'arrête là où l'on est plutôt que de
    // repartir. Sinon, le tronçon est insécable — on le fait, en le disant.
    if (apresCoucher && etapes.length > 0) {
      const dernier = etapes[etapes.length - 1];
      horloge = dernier.arriveeAbs;
      // ⚠ On reporte `nuitSubie` TEL QUEL. Clore la journée parce que le tronçon
      //   SUIVANT tomberait de nuit n'efface pas le fait qu'un tronçon insécable
      //   plus tôt dans la journée, lui, a déjà roulé dans le noir.
      clore(dernier.troncon.vers, dernier.soleil, nuitSubie);
      // On repart le LENDEMAIN DE L'ARRIVÉE, pas le lendemain du départ : sans
      // ça, un tronçon qui déborde sur la nuit ferait repartir dans le passé.
      jourDebut = Math.floor(horloge / 1440) + 1;
      horloge = jourDebut * 1440 + d.matinMin;
      arriveeEtape = horloge + t.heures * 60;
      jourEtape = Math.floor(arriveeEtape / 1440);
      s = soleil(t.vers.lat, t.vers.lng, decalerDate(d.dateISO, jourEtape));
      apresCoucher = s != null && arriveeEtape - jourEtape * 1440 > s.coucherMin;
    }

    const enjambe = enjambeUnCoucher(t.vers, d.dateISO, horloge, arriveeEtape);
    etapes.push({
      troncon: t,
      departAbs: horloge,
      arriveeAbs: arriveeEtape,
      soleil: s,
      arriveeDeNuit: apresCoucher,
      traverseLaNuit: enjambe,
    });
    if (apresCoucher || enjambe) nuitSubie = true;
    horloge = arriveeEtape;
  }
  if (etapes.length) {
    const dernier = etapes[etapes.length - 1];
    clore(dernier.troncon.vers, dernier.soleil, nuitSubie);
  }

  const vus = new Set<string>();
  const sansCoordonnees: Lieu[] = [];
  for (const l of [depart, ...troncons.map((t) => t.vers)])
    if ((l.lat == null || l.lng == null) && !vus.has(l.slug)) {
      vus.add(l.slug);
      sansCoordonnees.push(l);
    }

  return {
    depart,
    arrivee,
    troncons,
    heuresTotal,
    kmTotal,
    direct: troncons.length > 1 ? releveDirect(g, d.departSlug, d.arriveeSlug) : null,
    traite: {
      arriveeAbs,
      dateISO: dateArrivee,
      soleil: soleilArrivee,
      deNuit: deNuitTraite,
      nuits: jourArrivee,
      soleilInconnu: soleilArrivee == null,
      retardSurLeSoleilMin:
        soleilArrivee && minuteArrivee > soleilArrivee.coucherMin
          ? minuteArrivee - soleilArrivee.coucherMin
          : null,
    },
    journees,
    saisonniers: troncons.filter((t) => !t.touteAnnee),
    sansCoordonnees,
  };
}

export function estEchec(r: Plan | Echec): r is Echec {
  return "type" in r;
}

/**
 * Les excursions relevées AU DÉPART d'un lieu, hors celles déjà parcourues.
 * C'est la réponse à « où passer » qui ne coûte pas une donnée de plus : le
 * relevé sait déjà qu'on atteint la réserve d'Anja en 0,3 h depuis Ambalavao.
 */
export function excursionsDepuis(g: Graphe, slug: string, dejaVus: Set<string>): Troncon[] {
  return (g.sortants.get(slug) ?? [])
    .filter((t) => !t.sensInverse && !dejaVus.has(t.vers.slug))
    .sort((a, b) => a.heures - b.heures || a.vers.slug.localeCompare(b.vers.slug));
}
