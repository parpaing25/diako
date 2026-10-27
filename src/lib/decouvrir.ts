import { supabase } from "@/integrations/supabase/client";
import { chargerSuggestions } from "@/lib/envies";

/**
 * LES PORTES DE LA DÉCOUVERTE — par envie, pas par table.
 *
 * 🔴 CE QUE ÇA REMPLACE. Le site portait SEPT entrées vers la même matière :
 *    /explorer (61 lieux emblématiques), /villes (la descente administrative),
 *    /sites (2 435 attractions par région), /plats, /carte, /recherche et
 *    /projet. Aucune ne disait ce qu'il y avait derrière, et trois d'entre
 *    elles montraient les mêmes fiches sous un autre angle. Demande du
 *    propriétaire, mot pour mot : « il faut bien catégoriser pour que ce ne
 *    soit pas le bordel ».
 *
 * ⚠ UNE PORTE NOMME UNE ENVIE, PAS UNE TABLE. « Les plages » se comprend sans
 *   rien savoir du modèle de données ; « attractions, kind = plage » non. Le
 *   code qui voyage avec est celui de `dk_kinds_envie` en base : la porte et la
 *   liste qu'elle ouvre ne peuvent pas diverger.
 *
 * 🔴 POURQUOI « CULTURE » N'EST PAS UNE PORTE. Mesuré le 27/10/2026 :
 *    l'envie `culture` rend 957 fiches, dont 612 du genre `site` — et sur ces
 *    612, 477 n'ont AUCUN résumé. L'échantillon dit ce que c'est : Ikopa,
 *    Tsiribihina, Fiherenana, Loky, rivière de Nosivolo — les fleuves de
 *    Madagascar, importés du référentiel géographique. Une porte « Culture ·
 *    957 » qui ouvre sur des rivières muettes est le clic qui fait douter du
 *    reste du site. `patrimoine` (345) dit la vérité ; les 612 cours d'eau
 *    restent joignables par la carte et par la recherche.
 */

export interface Porte {
  /** Le code d'envie, tel que `dk_kinds_envie` le connaît. */
  code: string;
  /** Ce qu'on lit sur la tuile. */
  titre: string;
  /** Ce qu'il y a derrière, en trois mots — avant le clic, jamais après. */
  quoi: string;
}

/**
 * ⚠ L'ORDRE EST CELUI DE L'ENVIE, PAS CELUI DU VOLUME. Les sommets sont plus
 *   nombreux que les plages (824 contre 318) ; personne n'ouvre Madagascar en
 *   pensant « sommet » d'abord.
 */
export const PORTES: Porte[] = [
  { code: "plage", titre: "Les plages", quoi: "plages et baies" },
  { code: "parcs", titre: "Parcs et réserves", quoi: "parcs nationaux, réserves, aires protégées" },
  { code: "eaux", titre: "Cascades et grottes", quoi: "cascades, grottes, sources" },
  { code: "trek", titre: "Sommets et points de vue", quoi: "ce qui se monte et ce qui se regarde" },
  { code: "patrimoine", titre: "Patrimoine", quoi: "monuments, musées, œuvres" },
  { code: "gastronomie", titre: "Les plats", quoi: "la cuisine malgache, plat par plat" },
];

export const porteDe = (code: string): Porte | undefined =>
  PORTES.find((p) => p.code === code);

/* ── COMBIEN IL Y A DERRIÈRE CHAQUE PORTE ──────────────────────────────── */

export interface ComptesPortes {
  /** Un compte par code de porte. Une clé ABSENTE veut dire « on ne sait pas ». */
  parPorte: Record<string, number>;
  /** Les points que la carte dessine : adresses et sites situés. */
  pointsCarte: number | null;
  /** Les établissements publiés — ce que l'onglet Adresses ouvre. */
  adresses: number | null;
}

const VIDE: ComptesPortes = { parPorte: {}, pointsCarte: null, adresses: null };

type AppelRpc = {
  rpc: (nom: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const entier = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * ⚠ LE REPLI N'EST PAS DÉCORATIF, ET IL EST TEMPORAIRE. `stats_envies` arrive
 *   avec la migration 0126 ; tant qu'elle n'est pas appliquée, la fonction
 *   n'existe pas et l'appel répond en erreur. Plutôt qu'un écran sans aucun
 *   chiffre, on redemande le total porte par porte — `suggestions_envie` le
 *   rend déjà, avec un seul élément pour ne rien charger d'inutile. Six
 *   allers-retours au lieu d'un : acceptable une fois, pas en régime de
 *   croisière. À SUPPRIMER le jour où 0126 est en ligne.
 *
 * ⚠ UNE PORTE DONT LE COMPTE EST INCONNU OU NUL NE S'AFFICHE PAS. C'est la
 *   règle du projet — aucune entrée de navigation vers un écran vide — et
 *   c'est ce qui fait que « Patrimoine » s'allumera tout seul le jour où la
 *   migration passe, sans qu'une ligne d'écran change.
 */
async function parRepli(): Promise<ComptesPortes> {
  const [totaux, points] = await Promise.all([
    Promise.all(
      PORTES.map(async (p) => {
        try {
          const r = await chargerSuggestions(p.code, { limite: 1 });
          return [p.code, r.total] as const;
        } catch {
          return [p.code, 0] as const;
        }
      })
    ),
    compterPoints(),
  ]);
  const parPorte: Record<string, number> = {};
  for (const [code, n] of totaux) if (n > 0) parPorte[code] = n;
  return { parPorte, pointsCarte: points, adresses: null };
}

/**
 * Les points que la carte dessine, comptés par le serveur.
 *
 * ⚠ `head: true` NE RAMÈNE AUCUNE LIGNE — seulement l'en-tête Content-Range.
 *   Et on nomme `id` plutôt que `*` : une colonne interdite dans un `select=*`
 *   fait échouer toute la requête.
 *
 * ⚠ UN ÉCHEC REND `null`, PAS ZÉRO : « 0 point sur la carte » fermerait la
 *   porte du seul écran qui montre tout.
 */
async function compterPoints(): Promise<number | null> {
  const une = async (table: "attractions" | "pages") => {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .not("lat", "is", null);
    if (error) throw error;
    return count ?? 0;
  };
  try {
    const [sites, adresses] = await Promise.all([une("attractions"), une("pages")]);
    return sites + adresses;
  } catch {
    return null;
  }
}

let enVol: Promise<ComptesPortes> | null = null;

/**
 * ⚠ MÉMORISÉ AU NIVEAU DU MODULE, comme `stats_diako`. Ces comptes bougent de
 *   quelques unités par semaine et plusieurs écrans les demandent : un appel
 *   par montage de composant coûterait de l'egress pour un chiffre identique.
 */
export function chargerPortes(): Promise<ComptesPortes> {
  if (enVol) return enVol;
  const p = Promise.resolve((supabase as unknown as AppelRpc).rpc("stats_envies"))
    .then(async ({ data, error }) => {
      if (error || !data || typeof data !== "object") return parRepli();
      const o = data as Record<string, unknown>;
      const parPorte: Record<string, number> = {};
      for (const porte of PORTES) {
        const n = entier(o[porte.code]);
        if (n !== null && n > 0) parPorte[porte.code] = n;
      }
      // Aucune porte connue = une réponse qu'on ne sait pas lire : on redemande
      // plutôt que d'afficher six tuiles muettes.
      if (Object.keys(parPorte).length === 0) return parRepli();
      return {
        parPorte,
        pointsCarte: entier(o.points_carte),
        adresses: entier(o.adresses),
      };
    })
    .catch(() => {
      // ⚠ On oublie l'échec : garder une promesse rejetée condamnerait les
      //   compteurs pour toute la session après un hoquet réseau.
      enVol = null;
      return VIDE;
    });
  enVol = p;
  return p;
}
