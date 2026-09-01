/**
 * LES SEPT FAMILLES DE LA CARTE — couleur, icône, libellé, en un seul endroit.
 *
 * 🔴 CE QUE ÇA CORRIGE. La carte posait la MÊME pastille turquoise sur un hôtel,
 *    un sommet et une rivière, et la même grappe turquoise sur 1 163 points
 *    mélangés : rien, à l'écran, ne disait ce qu'on regardait. Le propriétaire
 *    l'a signalé capture à l'appui — « ce n'est pas beau à voir, mets des
 *    légendes, change d'icône à chaque type ».
 *
 * ⚠ LA FAMILLE EST DÉCIDÉE PAR LE SERVEUR (`dk_famille_carte`, migration 0118),
 *   jamais recalculée ici. Ce fichier ne porte que l'HABILLAGE. Redériver la
 *   famille dans le client la ferait diverger au premier `kind` ajouté en base,
 *   et le filtre cesserait de correspondre à ce que la carte dessine.
 *
 * ⚠ LES COMPTEURS NE SONT PAS ICI NON PLUS : ils viennent de `familles_zone`,
 *   compté par le serveur AVANT la troncature à 800 points. Compter le tableau
 *   reçu ferait annoncer « 40 restaurants » là où la base en a 616.
 *
 * ⚠ CHAQUE COULEUR PORTE UNE ICÔNE BLANCHE : toutes sont assez sombres pour
 *   que le glyphe reste lisible (rapport ≥ 4,5:1 sur blanc), et le liseré clair
 *   des épingles les détache des tuiles OpenStreetMap — un vert sur une forêt
 *   verte, sans liseré, disparaît.
 */

export type Famille =
  | "dormir"
  | "manger"
  | "plage"
  | "nature"
  | "sommet"
  | "culture"
  | "service";

export interface HabillageFamille {
  code: Famille;
  /** Le libellé du filtre — ce qu'on cherche, pas ce que la base stocke. */
  label: string;
  /** Ce que la famille recouvre, pour la légende dépliée. */
  detail: string;
  couleur: string;
  /** Le contenu d'un `<svg viewBox="0 0 24 24">` — tracés lucide, repris tels
   *  quels depuis `node_modules/lucide-react` (licence ISC) parce qu'une icône
   *  redessinée de mémoire ne ressemble jamais tout à fait à celle du reste du
   *  site. `currentColor` partout : la couleur vient du conteneur. */
  svg: string;
}

const ICONE = {
  lit: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  couverts:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  vagues:
    '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  arbres:
    '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  montagne: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  monument:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  boussole:
    '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
} as const;

/**
 * ⚠ L'ORDRE EST CELUI DE LA LÉGENDE ET DES FILTRES, et il n'est pas
 *   alphabétique : on ouvre par ce qu'un voyageur cherche en premier (dormir,
 *   manger), puis par ce qu'il vient voir. Trier par le nombre ferait sauter
 *   les cases d'une région à l'autre — un filtre qui bouge sous le doigt.
 */
export const FAMILLES: HabillageFamille[] = [
  {
    code: "dormir",
    label: "Où dormir",
    detail: "Hôtels, lodges et chambres d'hôtes.",
    couleur: "#1D4F91",
    svg: ICONE.lit,
  },
  {
    code: "manger",
    label: "Où manger",
    detail: "Restaurants, tables et gargotes.",
    couleur: "#D0471C",
    svg: ICONE.couverts,
  },
  {
    code: "plage",
    label: "Plages",
    detail: "Plages et lagons des deux côtes.",
    couleur: "#0E7C86",
    svg: ICONE.vagues,
  },
  {
    code: "nature",
    label: "Nature et eau",
    detail: "Parcs, réserves, cascades, grottes, sources, lacs et rivières.",
    couleur: "#2F6B34",
    svg: ICONE.arbres,
  },
  {
    code: "sommet",
    label: "Sommets",
    detail: "Sommets, massifs et points de vue.",
    couleur: "#8A5A21",
    svg: ICONE.montagne,
  },
  {
    code: "culture",
    label: "Culture",
    detail: "Patrimoine, musées, œuvres et sites à visiter.",
    couleur: "#6B3FA0",
    svg: ICONE.monument,
  },
  {
    code: "service",
    label: "Services",
    detail: "Agences, guides, transporteurs et loueurs.",
    couleur: "#4A5568",
    svg: ICONE.boussole,
  },
];

const PAR_CODE = new Map(FAMILLES.map((f) => [f.code, f]));

/**
 * L'habillage d'une famille.
 *
 * ⚠ UNE FAMILLE INCONNUE NE FAIT PAS TOMBER LA CARTE. Le serveur peut en
 *   introduire une avant que ce fichier ne la connaisse : on rend alors
 *   « Services », visible et filtrable, plutôt que `undefined` — qui ferait
 *   planter le rendu de l'épingle, donc disparaître la carte entière.
 */
export function habillage(code: string | null | undefined): HabillageFamille {
  return PAR_CODE.get(code as Famille) ?? FAMILLES[FAMILLES.length - 1];
}

/** Le SVG d'une famille, prêt à coller dans un `divIcon` Leaflet. */
export function svgFamille(code: string | null | undefined, taille: number): string {
  const f = habillage(code);
  return (
    `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${f.svg}</svg>`
  );
}

/** Ce que le serveur renvoie dans `familles_zone` / `familles`. */
export type Composition = Partial<Record<Famille, number>>;

/**
 * Convertit le `jsonb` du serveur en compteurs sûrs.
 *
 * ⚠ UN `count(*)` EST UN `bigint` : selon la façon dont il traverse le jsonb,
 *   il peut arriver en CHAÎNE. Le piège est déjà documenté dans `explorer.ts` —
 *   `"318".toLocaleString` n'existe pas, et l'écran tombe en dessinant la
 *   légende.
 */
export function composition(v: unknown): Composition {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Composition = {};
  for (const f of FAMILLES) {
    const n = Number((v as Record<string, unknown>)[f.code]);
    if (Number.isFinite(n) && n > 0) out[f.code] = n;
  }
  return out;
}

/** Le total d'une composition — la somme des familles, jamais un `.length`. */
export const totalComposition = (c: Composition): number =>
  FAMILLES.reduce((s, f) => s + (c[f.code] ?? 0), 0);

/**
 * LE DÉGRADÉ CONIQUE D'UNE GRAPPE — sa composition, lisible d'un coup d'œil.
 *
 * 🔴 C'EST CE QUI REMPLACE LA PASTILLE TURQUOISE UNIFORME. Une grappe de 950
 *    points sur Antananarivo est aux deux tiers des restaurants : l'anneau le
 *    montre en corail, sans qu'il faille zoomer pour l'apprendre.
 *
 * ⚠ DES ARRÊTS FRANCS (`couleur 0 x%`), pas un dégradé continu : entre deux
 *   familles voisines un fondu inventerait une couleur qui ne veut rien dire.
 * ⚠ UNE SEULE FAMILLE = UN ANNEAU PLEIN, et non un arc de 360° dont la couture
 *   se voit ; c'est le cas le plus fréquent hors des villes.
 */
export function degradeGrappe(c: Composition): string {
  const total = totalComposition(c);
  if (total === 0) return habillage(null).couleur;
  const presentes = FAMILLES.filter((f) => (c[f.code] ?? 0) > 0);
  if (presentes.length === 1) return presentes[0].couleur;

  let cumul = 0;
  const arrets = presentes.map((f) => {
    const debut = (cumul / total) * 100;
    cumul += c[f.code] ?? 0;
    const fin = (cumul / total) * 100;
    return `${f.couleur} ${debut.toFixed(2)}% ${fin.toFixed(2)}%`;
  });
  return `conic-gradient(${arrets.join(", ")})`;
}

/**
 * Ce qu'une grappe contient, en toutes lettres — l'infobulle au survol et le
 * texte que lisent les lecteurs d'écran, qui ne voient pas l'anneau.
 */
export function resumeComposition(c: Composition, limite = 3): string {
  return FAMILLES.filter((f) => (c[f.code] ?? 0) > 0)
    .sort((a, b) => (c[b.code] ?? 0) - (c[a.code] ?? 0))
    .slice(0, limite)
    .map((f) => `${(c[f.code] ?? 0).toLocaleString("fr-FR")} ${f.label.toLowerCase()}`)
    .join(", ");
}
