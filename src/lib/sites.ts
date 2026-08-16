import { supabase } from "@/integrations/supabase/client";
import { GRANDES_REGIONS, grandeRegionDe } from "@/lib/grandesRegions";

/**
 * ACCÈS AUX DONNÉES DE L'ÉCRAN « SITES ET PARCS » — la descente en deux niveaux.
 *
 * Même discipline que `api.ts`, `etablissements.ts`, `decouverte.ts` et
 * `explorer.ts` : l'écran ne parle jamais à Supabase, il appelle ce fichier.
 *
 * 🔴 CE QUE ÇA REMPLACE, ET POURQUOI L'ANCIEN ÉCRAN NE POUVAIT PAS TENIR.
 *    /sites déversait 2 476 fiches dans une seule grille de vignettes, triée par
 *    nom. Or 226 fiches sur 2 476 ont une photo — 9 %. Une grille d'images sur
 *    un fonds qui n'en a pas produit 2 250 cadres gris : l'écran occupait toute
 *    la hauteur du téléphone pour ne rien dire, et le seul filtre géographique
 *    était une liste déroulante de 23 régions au-dessus. On entre désormais PAR
 *    LA RÉGION, et la place va au texte utile.
 *
 * ⚠ CE QUE LA BASE CONTIENT VRAIMENT, mesuré le 16/08/2026 sur les 2 476 sites
 *   publiés. Ces chiffres commandent chaque décision d'affichage de l'écran :
 *     · coordonnées 2 476/2 476 · rattachés à un lieu 2 465 · photo 226 (9 %)
 *     · description 157 (6 %) · tarif non-résident 6 · tarif résident 0
 *     · fady 0 · meilleurs mois 0 · guide obligatoire 0 (renseigné partout,
 *       mais à `false` PARTOUT — voir `FILTRE_GUIDE_INERTE` plus bas).
 *   Rien de tout cela n'est écrit en dur dans l'écran : les compteurs affichés
 *   sont TOUJOURS recalculés depuis la réponse du serveur. Ces mesures servent à
 *   justifier la forme, pas à la remplir.
 *
 * ⚠ LES COMPTEURS VIENNENT DU CONTRAT, JAMAIS D'UN `.length`. PostgREST plafonne
 *   une réponse à 1 000 lignes SANS LE DIRE : compter le tableau reçu ferait
 *   annoncer « 1 000 sites » avec l'aplomb d'un chiffre exact.
 */

/* ── LE CONTRAT, TRANSCRIT AU MOT PRÈS ─────────────────────────────────── */

/** Un type de site et son compte, tel que `sites_par_region` le range. */
export interface TypeCompte {
  code: string;
  n: number;
}

/** Une carte du premier niveau : une région, avec de quoi la juger sans l'ouvrir. */
export interface RegionSites {
  slug: string;
  nom: string;
  grande_region: string | null;
  nb_sites: number;
  nb_avec_photo: number;
  nb_avec_description: number;
  /** Les villes les mieux dotées de la région — au plus trois. */
  villes: string[];
  /** Les types dominants — au plus trois. */
  types: TypeCompte[];
  cover_url: string | null;
  cover_credit: string | null;
  /**
   * ⚠ HORS CONTRAT, ET C'EST VOULU. Le panneau « ce qui est documenté » demande
   *   un troisième compteur — les fiches avec un tarif — que `sites_par_region`
   *   ne rend pas. Plutôt que de l'inventer ou de le déduire d'un échantillon,
   *   on le lit S'IL ARRIVE et on tait la tuile sinon. Le jour où la fonction
   *   ajoute `nb_avec_tarif`, l'écran l'affiche sans qu'une ligne change ici.
   */
  nb_avec_tarif: number | null;
}

/** Une facette de type, avec son compte RÉEL pour la région (pas pour la page). */
export interface FacetteType {
  code: string;
  libelle: string;
  n: number;
}

/** Une facette de ville, avec son compte RÉEL pour la région. */
export interface FacetteVille {
  slug: string;
  nom: string;
  n: number;
}

/** Une ligne de la liste du deuxième niveau. */
export interface SiteLigne {
  slug: string;
  nom: string;
  kind: string;
  ville: string | null;
  /** Distance à la ville. `null` quand elle n'est pas calculable. */
  km_ville: number | null;
  /**
   * ⚠ TEXTE LIBRE, ET SOUVENT UNE PHRASE ENTIÈRE — « RN7 sur toute sa longueur,
   *   18 à 24 h en direct, à ne pas faire d'une traite ». Ce n'est PAS un code
   *   d'état : le rendre en pastille tronquerait l'information la plus utile de
   *   la ligne. Il se lit comme une phrase, et il se replie sur rien.
   */
  etat_route: string | null;
  resume: string | null;
  cover_url: string | null;
  cover_credit: string | null;
  guide_obligatoire: boolean;
  tarif_non_resident_ar: number | null;
  tarif_resident_ar: number | null;
  best_months: number[];
  fady_n: number;
  /** La fiche a au moins une description ET une photo. */
  complet: boolean;
  /**
   * ⚠ HORS CONTRAT. `signaler("attraction", id, …)` de `api.ts` — le canal de
   *   correction ouvert par la migration 0044 — a besoin de l'identifiant, que
   *   le contrat ne rend pas. On le lit s'il arrive ; sinon l'écran renvoie vers
   *   la fiche, qui porte déjà sa source et son attribution. Aucun bouton mort
   *   dans les deux cas.
   */
  id: string | null;
}

export interface PageRegionSites {
  region: { slug: string; nom: string; grande_region: string | null; nb_sites: number };
  facettes: { types: FacetteType[]; villes: FacetteVille[] };
  elements: SiteLigne[];
  /** `null` = il n'y a plus rien après. */
  curseur: string | null;
  /** Le vrai total de la combinaison de filtres, avant troncature. */
  total: number;
}

export interface FiltresSites {
  types?: string[];
  ville?: string | null;
  /** N'est envoyé qu'à `true` : voir `FILTRE_GUIDE_INERTE`. */
  sansGuide?: boolean;
  curseur?: string | null;
  limite?: number;
}

/** Une page de liste. 24 tient sur un écran de 390 px sans faire attendre. */
export const PAR_PAGE = 24;

/** ⚠ Le contrat plafonne à 100 par appel. Ceinture ET bretelles : on ne demande
 *  jamais plus, même si un appelant se trompe — un `p_limite` refusé rendrait
 *  une erreur là où une page tronquée suffit. */
const PLAFOND = 100;

/* ── L'APPEL ───────────────────────────────────────────────────────────── */

/**
 * ⚠ POURQUOI ON N'APPELLE PAS LE CLIENT TYPÉ DIRECTEMENT — même raison que dans
 *   `explorer.ts`. `integrations/supabase/types.ts` est REGÉNÉRÉ depuis la base :
 *   `sites_par_region` et `sites_de_la_region`, écrites en parallèle, n'y
 *   figurent pas encore, et `supabase.rpc("sites_par_region")` ne compilerait
 *   pas. Plutôt que de modifier un fichier partagé — ou de parsemer le code de
 *   `any`, précisément ce que le tsconfig de ce dépôt refuse — on déclare EN UN
 *   SEUL ENDROIT la seule forme dont on a besoin.
 *
 * ⚠ CE RACCOURCI NE DISPENSE PAS DE VALIDER. `unknown` oblige à convertir, et
 *   c'est ce qui empêche une réponse inattendue de faire tomber l'écran.
 */
type AppelRpc = {
  rpc: (
    nom: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const client = supabase as unknown as AppelRpc;

async function appeler(nom: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data ?? null;
}

/* ── CONVERSION ────────────────────────────────────────────────────────── */

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const tableau = (v: unknown): Objet[] => (Array.isArray(v) ? v.filter(estObjet) : []);

/** Une chaîne présente et non vide, `null` sinon : `""` et `null` disent la même
 *  chose à l'écran — rien — et le premier ferait afficher un crédit vide. */
const texte = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const mot = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * ⚠ UN COMPTEUR SE CONVERTIT, IL NE SE SUPPOSE PAS. Un `count(*)` est un
 *   `bigint` : selon la façon dont il traverse le jsonb, il peut arriver en
 *   chaîne de caractères. `"133".toLocaleString` n'existe pas — l'écran serait
 *   tombé en rendant la carte, page blanche à la clé.
 */
const entier = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ⚠ ZÉRO N'EST PAS « ABSENT », NI POUR UNE DISTANCE NI POUR UN TARIF. Un site
 *   dans la ville même est à 0 km ; une entrée à 0 Ar serait une gratuité
 *   CONSTATÉE, pas une absence de relevé. Replier les deux sur `null` ferait
 *   disparaître une information vraie.
 */
const nombreOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** ⚠ Un booléen ABSENT n'est pas `false`. Les deux se rendent pareil ici, mais
 *  seul `=== true` compte : une chaîne `"false"` vaut `true` en JavaScript. */
const booleen = (v: unknown): boolean => v === true || v === "true";

/** Un tableau de mois, purgé de ce qui n'est pas un mois valide. Un `13` ou un
 *  `0` sorti d'un import ferait sortir la frise de ses douze cases. */
const mois = (v: unknown): number[] =>
  Array.isArray(v)
    ? v.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    : [];

const mots = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(texte).filter((s): s is string => s !== null) : [];

function versTypeCompte(o: Objet): TypeCompte {
  return { code: mot(o.code), n: entier(o.n) };
}

function versRegionSites(o: Objet): RegionSites {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    grande_region: texte(o.grande_region),
    nb_sites: entier(o.nb_sites),
    nb_avec_photo: entier(o.nb_avec_photo),
    nb_avec_description: entier(o.nb_avec_description),
    villes: mots(o.villes),
    types: tableau(o.types).map(versTypeCompte).filter((t) => t.code !== ""),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    nb_avec_tarif: nombreOuNull(o.nb_avec_tarif),
  };
}

function versFacetteType(o: Objet): FacetteType {
  const code = mot(o.code);
  return { code, libelle: texte(o.libelle) ?? libelleType(code), n: entier(o.n) };
}

function versFacetteVille(o: Objet): FacetteVille {
  return { slug: mot(o.slug), nom: mot(o.nom), n: entier(o.n) };
}

function versSiteLigne(o: Objet): SiteLigne {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    ville: texte(o.ville),
    km_ville: nombreOuNull(o.km_ville),
    etat_route: texte(o.etat_route),
    resume: texte(o.resume),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    guide_obligatoire: booleen(o.guide_obligatoire),
    tarif_non_resident_ar: nombreOuNull(o.tarif_non_resident_ar),
    tarif_resident_ar: nombreOuNull(o.tarif_resident_ar),
    best_months: mois(o.best_months),
    fady_n: entier(o.fady_n),
    complet: booleen(o.complet),
    id: texte(o.id),
  };
}

/* ── LES DEUX NIVEAUX ──────────────────────────────────────────────────── */

/**
 * Niveau 1 : une carte par région, déjà triée par documentation décroissante
 * côté base.
 *
 * ⚠ ON NE RETRIE PAS À L'ARRIVÉE. Le contrat garantit l'ordre « les mieux
 *   documentées d'abord » ; le recalculer ici avec une autre formule ferait
 *   diverger l'écran de la base sans que personne ne s'en aperçoive. Les autres
 *   tris de l'écran sont explicites et choisis par l'utilisateur.
 */
export async function chargerRegionsSites(): Promise<RegionSites[]> {
  const data = await appeler("sites_par_region");
  return tableau(data).map(versRegionSites).filter((r) => r.slug !== "");
}

/**
 * Niveau 2 : les sites d'une région, filtrés et paginés PAR CURSEUR.
 *
 * `null` = ce slug de région n'existe pas.
 *
 * ⚠ L'APPELANT DOIT DISTINGUER « inconnue » de « vide ». Une région sans site ne
 *   mérite pas la même page qu'une adresse cassée : confondre les deux fait
 *   passer un lien partagé vers une région réelle mais dépeuplée pour une 404.
 *
 * ⚠ `p_sans_guide` N'EST ENVOYÉ QU'À `true`. À `false` la fonction rendrait les
 *   sites où le guide EST obligatoire — l'inverse de la case décochée, qui veut
 *   dire « ne filtre pas ». On envoie `null` dans ce cas, jamais `false`.
 *
 * ⚠ UN TABLEAU DE TYPES VIDE N'EST PAS « aucun type » : c'est « tous ». On
 *   envoie `null`, sinon la fonction n'aurait plus aucun type à faire
 *   correspondre et rendrait une liste vide sur un écran sans filtre actif.
 */
export async function chargerSitesDeLaRegion(
  region: string,
  f: FiltresSites = {}
): Promise<PageRegionSites | null> {
  const data = await appeler("sites_de_la_region", {
    p_region: region,
    p_types: f.types && f.types.length > 0 ? f.types : null,
    p_ville: f.ville || null,
    p_sans_guide: f.sansGuide ? true : null,
    p_curseur: f.curseur || null,
    p_limite: Math.min(f.limite ?? PAR_PAGE, PLAFOND),
  });

  if (!estObjet(data)) return null;
  const r = data.region;
  if (!estObjet(r) || !mot(r.slug)) return null;

  const facettes = estObjet(data.facettes) ? data.facettes : {};

  return {
    region: {
      slug: mot(r.slug),
      nom: mot(r.nom),
      grande_region: texte(r.grande_region),
      nb_sites: entier(r.nb_sites),
    },
    facettes: {
      types: tableau(facettes.types).map(versFacetteType).filter((t) => t.code !== ""),
      villes: tableau(facettes.villes).map(versFacetteVille).filter((v) => v.slug !== ""),
    },
    elements: tableau(data.elements).map(versSiteLigne).filter((e) => e.slug !== ""),
    curseur: texte(data.curseur),
    total: entier(data.total),
  };
}

/* ── LES TYPES DE SITES ────────────────────────────────────────────────── */

/**
 * Les 14 types réellement présents en base, en français lisible.
 *
 * 🔴 « PARCS NATIONAUX » N'EST PAS LE TYPE `parc`, ET S'Y TROMPER COÛTE CHER.
 *    `reserve` (133 fiches) porte l'Ankarafantsika, la réserve de Beza Mahafaly
 *    et les parcs nationaux ; `parc` (122 fiches) porte des jardins de quartier
 *    et des bouts de forêt urbaine — « Jardin Fusilier Marin », « Parc
 *    Tsarasaotra ». Un raccourci « Parcs nationaux » branché sur `parc` aurait
 *    servi 122 squares à qui cherchait l'Isalo, sans qu'aucune erreur ne le
 *    signale.
 *
 * ⚠ CETTE TABLE RECOPIE `dk_libelle_type` DE LA MIGRATION 0091, AU MOT PRÈS, et
 *   les deux doivent bouger ensemble. Le serveur envoie déjà le libellé des
 *   FACETTES du niveau 2 ; celle-ci ne sert qu'aux raccourcis et aux cartes du
 *   niveau 1, que `sites_par_region` rend sans libellé. Deux formulations
 *   différentes pour la même famille — « Parcs nationaux et réserves » sur le
 *   raccourci, « Réserves et parcs nationaux » dans le filtre — feraient croire
 *   à deux ensembles distincts, et le filtre paraîtrait ne pas répondre.
 *
 * ⚠ UN TYPE ABSENT DE CETTE TABLE S'AFFICHE TEL QUEL. Il vaut mieux lire
 *   `source_chaude` que voir la ligne disparaître de l'écran.
 */
export const LIBELLE_TYPE: Record<string, string> = {
  reserve: "Réserves et parcs nationaux",
  parc: "Forêts et parcs",
  sommet: "Sommets et massifs",
  plage: "Côtes, baies et plages",
  patrimoine: "Patrimoine",
  site: "Lacs, îles et rivières",
  point_de_vue: "Points de vue",
  cascade: "Cascades",
  grotte: "Grottes",
  musee: "Musées",
  parc_animalier: "Parcs animaliers",
  oeuvre: "Œuvres",
  source: "Sources",
  source_chaude: "Sources chaudes",
  aire: "Aires de pique-nique",
};

export function libelleType(code: string): string {
  return LIBELLE_TYPE[code] ?? code;
}

/**
 * Une forme courte, pour l'étiquette d'une LIGNE — là où le libellé de famille
 * ne va pas.
 *
 * ⚠ CE N'EST PAS UNE DEUXIÈME TRADUCTION, C'EST UN AUTRE USAGE. « Réserves et
 *   parcs nationaux » désigne un ENSEMBLE : juste au-dessus d'une case à cocher,
 *   faux au-dessus d'un site unique, et long de deux lignes sur un écran de
 *   390 px avant même qu'on lise le nom du lieu. Une ligne dit « Parc national ».
 */
export const LIBELLE_TYPE_COURT: Record<string, string> = {
  /* 🔴 C'ÉTAIT « Parc national », ET C'ÉTAIT FAUX POUR CENT FICHES. Le code
      `reserve` couvre 133 sites ; 33 seulement portent « parc national » dans
      leur nom. Coller l'étiquette à toutes promeut au rang de parc national
      des réserves privées et des forêts communautaires — une pastille verte
      qui ment sur le statut d'une aire protégée. */
  reserve: "Réserve",
  parc: "Parc",
  sommet: "Sommet",
  plage: "Plage",
  patrimoine: "Patrimoine",
  site: "Site naturel",
  point_de_vue: "Point de vue",
  cascade: "Cascade",
  grotte: "Grotte",
  musee: "Musée",
  parc_animalier: "Parc animalier",
  oeuvre: "Œuvre",
  source: "Source",
  source_chaude: "Source chaude",
  aire: "Aire de pique-nique",
};

export function libelleTypeCourt(code: string): string {
  return LIBELLE_TYPE_COURT[code] ?? code;
}

/**
 * Les types que l'on cherche par leur nom, dans l'ordre où on les cherche.
 *
 * ⚠ CE N'EST PAS LA LISTE DES PLUS NOMBREUX. `sommet` (801) et `site` (627)
 *   écrasent tout, mais personne n'ouvre un annuaire pour « un sommet » : on
 *   cherche l'Isalo, une cascade, un musée. Les raccourcis servent l'intention,
 *   pas la statistique — le volume, lui, est dans les cartes de région.
 */
export const RACCOURCIS: string[] = ["reserve", "cascade", "parc_animalier", "grotte", "musee"];

/* ── LE GROUPEMENT PAR GRANDE RÉGION ───────────────────────────────────── */

export interface GroupeRegions {
  code: string;
  titre: string;
  regions: RegionSites[];
}

/**
 * Range les 23 régions sous les 5 grandes régions de `grandesRegions.ts`.
 *
 * ⚠ LA LISTE N'EST PAS RECOPIÉE ICI. Elle vit dans `src/lib/grandesRegions.ts`,
 *   qui vérifie à l'exécution qu'elle contient bien les 23 régions, une seule
 *   fois chacune. Une deuxième copie aurait divergé au premier redécoupage
 *   administratif.
 *
 * 🔴 AUCUNE RÉGION NE PEUT SE PERDRE. Une orthographe divergente entre
 *   `places.region` et le module (« Amoron'i Mania » avec une apostrophe droite
 *   contre une courbe) ferait disparaître la région de l'écran EN SILENCE : ses
 *   sites ne seraient atteignables par aucun chemin. Ce qu'aucun groupe ne
 *   réclame tombe donc dans un dernier groupe VISIBLE.
 *
 * ⚠ ON SE FIE D'ABORD AU MODULE, PAS AU CHAMP `grande_region` DU CONTRAT : le
 *   contrat ne dit pas s'il porte le code (« hauts-plateaux ») ou le libellé
 *   (« Hauts Plateaux »). Les deux lectures sont acceptées en repli.
 */
export function grouperParGrandeRegion(regions: RegionSites[]): GroupeRegions[] {
  const restant = new Map(regions.map((r) => [r.slug, r]));

  const groupes = GRANDES_REGIONS.map((g) => {
    const dedans = regions.filter((r) => {
      const parLeNom = grandeRegionDe(r.nom);
      if (parLeNom) return parLeNom.code === g.code;
      const brut = (r.grande_region ?? "").toLowerCase();
      return brut === g.code || brut === g.libelle.toLowerCase();
    });
    dedans.forEach((r) => restant.delete(r.slug));
    return { code: g.code, titre: g.libelle, regions: dedans };
  });

  if (restant.size > 0)
    groupes.push({ code: "autres", titre: "Autres régions", regions: [...restant.values()] });

  return groupes.filter((g) => g.regions.length > 0);
}

/** Le code de grande région d'une région, pour le fil d'Ariane du niveau 2. */
export function grandeRegionDeRegion(
  nom: string,
  brut: string | null
): { code: string; libelle: string } | null {
  const parLeNom = grandeRegionDe(nom);
  if (parLeNom) return { code: parLeNom.code, libelle: parLeNom.libelle };
  const b = (brut ?? "").toLowerCase();
  const g = GRANDES_REGIONS.find((x) => x.code === b || x.libelle.toLowerCase() === b);
  return g ? { code: g.code, libelle: g.libelle } : null;
}

/* ── LES ADRESSES ──────────────────────────────────────────────────────── */

/**
 * ⚠ POURQUOI `?region=` ET NON `/sites/:region`. `App.tsx` — qui n'appartient
 *   pas à cet écran — ne déclare que `/sites` : `/sites/diana` tomberait sur la
 *   page « introuvable ». `/explorer` descend ses trois paliers de la même
 *   façon, par `?region=` et `?ville=`, et cet écran s'aligne dessus.
 *   L'adresse reste propre, partageable et indexable, ce qui est le point.
 *   Le jour où la route existe, seul ce fichier change.
 */
export function lienRegion(slug: string, type?: string | null): string {
  const p = new URLSearchParams({ region: slug });
  if (type) p.set("type", type);
  return `/sites?${p.toString()}`;
}

/** Le cran du milieu du fil d'Ariane : la grande région, au niveau 1. */
export function lienGroupe(code: string): string {
  return `/sites?groupe=${encodeURIComponent(code)}`;
}

/* ── PETITES MISES EN FORME ────────────────────────────────────────────── */

export const nombre = (n: number) => n.toLocaleString("fr-FR");

export const pluriel = (n: number, singulier: string, plur?: string) =>
  `${nombre(n)} ${n > 1 ? (plur ?? `${singulier}s`) : singulier}`;

/**
 * Compare deux textes comme un utilisateur les tape : sans accent, sans
 * apostrophe, sans casse.
 *
 * 🔴 « AMORON'I MANIA » NE SE TAPE PAS. Avec une apostrophe droite, une
 *    apostrophe courbe ou aucune des deux, une recherche exacte ne rendait
 *    rien — et l'utilisateur en concluait que la région n'existe pas. Toute
 *    ponctuation devient une espace, et les espaces sont ignorées en bout.
 */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    // ⚠ `\p{Diacritic}` PLUTÔT QU'UN INTERVALLE DE CARACTÈRES COMBINANTS. Ces
    //   caractères sont invisibles dans un éditeur : une classe `[..]` qui les
    //   contient se corrompt au premier outil qui relit le fichier dans un autre
    //   encodage, et la recherche cesse d'ignorer les accents SANS ERREUR.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ⚠ CONSTAT DU 16/08/2026, À RELIRE AVANT DE CROIRE CE FILTRE UTILE.
 *   `guide_required` est renseigné sur les 2 476 fiches — et vaut `false` sur
 *   les 2 476. « Sans guide obligatoire » n'écarte donc AUCUNE fiche
 *   aujourd'hui. Le filtre n'est pas une impasse (il rend tout, pas rien) et il
 *   fonctionnera le jour où un guide sera saisi ; mais l'écran doit le DIRE
 *   quand il ne retire rien, sinon l'utilisateur croit avoir filtré.
 *   L'écran ne se fie pas à cette constante : il compare le total filtré au
 *   total de la région, et parle seulement si les deux sont égaux.
 */
export const FILTRE_GUIDE_INERTE =
  "Aucune fiche n'impose encore de guide : cette case ne retire rien pour le moment.";
