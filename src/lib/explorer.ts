import { supabase } from "@/integrations/supabase/client";

/**
 * ACCÈS AUX DONNÉES DE L'ÉCRAN EXPLORER — la descente pays › région › ville.
 *
 * Même discipline que `api.ts`, `etablissements.ts` et `decouverte.ts` :
 * l'écran ne parle jamais à Supabase, il appelle ce fichier.
 *
 * 🔴 CE QUE ÇA REMPLACE. Explorer déversait les 522 destinations en une seule
 *    grille alphabétique. Chercher où aller dans le Nord voulait dire faire
 *    défiler d'Ambalavao à Vohipeno en connaissant déjà les noms — c'est-à-dire
 *    n'avoir plus besoin du catalogue. On descend maintenant par paliers :
 *    23 régions, puis leurs villes, puis les destinations de chaque ville.
 *
 * ⚠ LES COMPTEURS VIENNENT DES FONCTIONS, JAMAIS D'UN `.length`. Une carte de
 *   région annonce « 81 destinations » alors que l'écran n'en montrera que
 *   vingt-quatre : compter le tableau reçu ferait mentir le chiffre, et
 *   PostgREST plafonne de toute façon une réponse à 1 000 lignes SANS LE DIRE.
 *
 * ⚠ AUCUNE PAGINATION ICI. Les trois fonctions rendent au plus 400 éléments par
 *   tableau — c'est le contrat. La descente par palier suffit à ce que ce
 *   plafond ne soit jamais atteint dans les faits ; le « voir plus » de l'écran
 *   se sert dans le tableau DÉJÀ reçu, il ne redemande rien.
 */

/* ── LE CONTRAT, TRANSCRIT ─────────────────────────────────────────────── */

/** Une carte du premier palier : une région de Madagascar. */
export interface RegionCarte {
  slug: string;
  nom: string;
  nb_destinations: number;
  nb_etablissements: number;
  cover_url: string | null;
  cover_credit: string | null;
}

/** Une ville dans une région — deuxième palier, et porte d'entrée du troisième. */
export interface VilleCarte {
  slug: string;
  nom: string;
  kind: string;
  nb_destinations: number;
  nb_etablissements: number;
  nb_recits: number;
  cover_url: string | null;
  cover_credit: string | null;
  summary: string | null;
}

/**
 * Une destination de la région qu'aucune ville ne peut accueillir.
 *
 * ⚠ ELLE N'A PAS DE `nb_destinations` : c'est une feuille de l'arbre, pas un
 *   palier. Lui en inventer un afficherait « 0 destination » sous chaque carte.
 */
export interface AilleursCarte {
  slug: string;
  nom: string;
  kind: string;
  nb_etablissements: number;
  nb_recits: number;
  cover_url: string | null;
  cover_credit: string | null;
  summary: string | null;
}

export interface RegionDetail {
  region: { slug: string; nom: string; nb_destinations: number };
  villes: VilleCarte[];
  ailleurs: AilleursCarte[];
}

/** Une destination rattachée à une ville — troisième palier. */
export interface DestinationCarte {
  slug: string;
  nom: string;
  kind: string;
  /** Distance à la ville, arrondie. `null` quand l'un des deux points n'a pas
   *  de coordonnée — on n'affiche alors aucune distance plutôt qu'un zéro. */
  km: number | null;
  summary: string | null;
  nb_etablissements: number;
  nb_recits: number;
  cover_url: string | null;
  cover_credit: string | null;
}

export interface VilleDetail {
  ville: {
    slug: string;
    nom: string;
    region: string | null;
    summary: string | null;
    cover_url: string | null;
    cover_credit: string | null;
  };
  destinations: DestinationCarte[];
}

/* ── L'APPEL ───────────────────────────────────────────────────────────── */

/**
 * ⚠ POURQUOI ON N'APPELLE PAS LE CLIENT TYPÉ DIRECTEMENT.
 *   `integrations/supabase/types.ts` est REGÉNÉRÉ depuis la base : les trois
 *   fonctions d'Explorer, écrites en parallèle, n'y figurent pas encore, et
 *   `supabase.rpc("explorer_regions")` ne compilerait pas. Plutôt que de
 *   modifier un fichier partagé — ou de parsemer le code de `any`, précisément
 *   ce que le tsconfig de ce dépôt refuse — on déclare EN UN SEUL ENDROIT la
 *   seule forme dont on a besoin : un nom, des arguments, une réponse `unknown`
 *   que les convertisseurs plus bas valident champ par champ.
 *
 * ⚠ CE RACCOURCI NE DISPENSE PAS DE VALIDER. `unknown` oblige à convertir ;
 *   c'est justement ce qui empêche une réponse inattendue de faire tomber
 *   l'écran, alors qu'un `any` l'aurait laissée filer jusqu'au rendu.
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

/** Un tableau du contrat, purgé de ce qui n'est pas un objet. */
const tableau = (v: unknown): Objet[] => (Array.isArray(v) ? v.filter(estObjet) : []);

/** Une chaîne présente et non vide, `null` sinon : `""` et `null` disent la
 *  même chose à l'écran — rien — et le premier ferait afficher un crédit vide. */
const texte = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const mot = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * ⚠ UN COMPTEUR SE CONVERTIT, IL NE SE SUPPOSE PAS. Un `count(*)` est un
 *   `bigint` : selon la façon dont il traverse le jsonb, il peut arriver en
 *   chaîne de caractères. `"81".toLocaleString` n'existe pas — l'écran serait
 *   tombé en rendant la carte, page blanche à la clé.
 */
const entier = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ⚠ ZÉRO EST UNE VRAIE DISTANCE (la destination est dans la ville même). On ne
 *   peut donc pas replier « absent » et « zéro » sur la même valeur, sinon la
 *   moitié des destinations d'une ville perdrait sa mention.
 */
const distance = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function versRegion(o: Objet): RegionCarte {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    nb_destinations: entier(o.nb_destinations),
    nb_etablissements: entier(o.nb_etablissements),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
  };
}

function versVille(o: Objet): VilleCarte {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    nb_destinations: entier(o.nb_destinations),
    nb_etablissements: entier(o.nb_etablissements),
    nb_recits: entier(o.nb_recits),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    summary: texte(o.summary),
  };
}

function versAilleurs(o: Objet): AilleursCarte {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    nb_etablissements: entier(o.nb_etablissements),
    nb_recits: entier(o.nb_recits),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    summary: texte(o.summary),
  };
}

function versDestination(o: Objet): DestinationCarte {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    km: distance(o.km),
    summary: texte(o.summary),
    nb_etablissements: entier(o.nb_etablissements),
    nb_recits: entier(o.nb_recits),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
  };
}

/* ── LES TROIS PALIERS ─────────────────────────────────────────────────── */

/** Premier palier : une carte par région, triée par nom côté base. */
export async function chargerRegions(): Promise<RegionCarte[]> {
  const data = await appeler("explorer_regions");
  // ⚠ On ne retrie pas : le contrat garantit l'ordre alphabétique, et retrier
  //   ici avec un autre `localeCompare` ferait diverger l'écran de la base.
  return tableau(data).map(versRegion).filter((r) => r.slug !== "");
}

/**
 * Deuxième palier. `null` = ce slug de région n'existe pas.
 *
 * ⚠ L'APPELANT DOIT DISTINGUER « inconnue » de « vide ». Une région sans ville
 *   n'est pas une adresse cassée : les deux méritent un écran différent, sinon
 *   un lien partagé vers une région réelle mais dépeuplée passe pour une 404.
 */
export async function chargerRegion(slug: string): Promise<RegionDetail | null> {
  const data = await appeler("explorer_region", { p_slug: slug });
  if (!estObjet(data)) return null;
  const r = data.region;
  if (!estObjet(r) || !mot(r.slug)) return null;
  return {
    region: {
      slug: mot(r.slug),
      nom: mot(r.nom),
      nb_destinations: entier(r.nb_destinations),
    },
    villes: tableau(data.villes).map(versVille).filter((v) => v.slug !== ""),
    ailleurs: tableau(data.ailleurs).map(versAilleurs).filter((a) => a.slug !== ""),
  };
}

/** Troisième palier. `null` = ce slug de ville n'existe pas. */
export async function chargerVille(slug: string): Promise<VilleDetail | null> {
  const data = await appeler("explorer_ville", { p_slug: slug });
  if (!estObjet(data)) return null;
  const v = data.ville;
  if (!estObjet(v) || !mot(v.slug)) return null;
  return {
    ville: {
      slug: mot(v.slug),
      nom: mot(v.nom),
      region: texte(v.region),
      summary: texte(v.summary),
      cover_url: texte(v.cover_url),
      cover_credit: texte(v.cover_credit),
    },
    destinations: tableau(data.destinations)
      .map(versDestination)
      .filter((d) => d.slug !== ""),
  };
}

/* ── LE CRAN « RÉGION » DU FIL D'ARIANE ────────────────────────────────── */

/**
 * ⚠ POURQUOI CETTE RÉSOLUTION EXISTE. Le fil d'Ariane d'une ville doit être
 *   « Madagascar › Diana › Nosy Be » avec CHAQUE cran cliquable — y compris
 *   quand on ouvre un lien partagé qui ne porte que `?ville=`. Or
 *   `explorer_ville` rend `ville.region` sans son slug : sans cette résolution,
 *   le cran du milieu serait mort, ou pire, pointerait vers une adresse
 *   fabriquée à partir du nom. On ne fabrique pas de slug, on le retrouve.
 */
let memoRegions: Promise<RegionCarte[]> | null = null;

function regionsConnues(): Promise<RegionCarte[]> {
  if (!memoRegions) {
    memoRegions = chargerRegions().catch((e) => {
      // ⚠ UNE PROMESSE REJETÉE GARDÉE EN MÉMOIRE condamnerait le fil d'Ariane
      //   pour toute la session : une coupure de trois secondes tuerait la
      //   remontée sur toutes les villes visitées ensuite. On oublie l'échec.
      memoRegions = null;
      throw e;
    });
  }
  return memoRegions;
}

/**
 * Retrouve la région à partir de ce que `explorer_ville` a mis dans
 * `ville.region`. Rend `null` quand elle reste introuvable — l'écran affiche
 * alors un cran de moins, ce qui vaut infiniment mieux qu'un lien mort.
 */
export async function regionDeVille(
  valeur: string | null
): Promise<{ slug: string; nom: string } | null> {
  const v = valeur?.trim();
  if (!v) return null;
  try {
    const rs = await regionsConnues();
    // ⚠ ON ACCEPTE LES DEUX LECTURES. Le contrat écrit `region` sans préciser
    //   s'il s'agit du nom (« Diana ») ou du slug (« diana ») : les deux sont
    //   reconnus, et la casse est ignorée en dernier recours. Choisir une seule
    //   lecture aurait fait dépendre le fil d'Ariane d'un pari.
    const r =
      rs.find((x) => x.nom === v) ??
      rs.find((x) => x.slug === v) ??
      rs.find((x) => x.nom.toLowerCase() === v.toLowerCase());
    return r ? { slug: r.slug, nom: r.nom } : null;
  } catch {
    return null;
  }
}
