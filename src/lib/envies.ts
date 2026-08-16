import { supabase } from "@/integrations/supabase/client";

/**
 * CE QU'ON PROPOSE DERRIÈRE UNE ENVIE.
 *
 * 🔴 CE QUI EXISTAIT : RIEN. Sur /projet, cocher « plage » posait une étiquette
 *    et s'arrêtait là. Le voyageur annonçait une envie, personne ne lui
 *    montrait ce qu'il y avait. Demande du propriétaire, mot pour mot : « les
 *    plages par exemple on liste les plages et l'utilisateur peut faire un
 *    choix sur quelle plage il voudrait y aller ».
 *
 * ⚠ LA GASTRONOMIE NE DÉSIGNE PAS DES LIEUX. Les quatre autres envies pointent
 *   vers des endroits ; qui a envie de gastronomie veut MANGER UN PLAT. Cette
 *   envie-là rend donc les 95 plats du référentiel — c'est le même geste de
 *   choix, sur une autre matière.
 *
 * ⚠ « je ne sais pas encore » NE PROPOSE RIEN, volontairement. Dérouler 318
 *   plages à quelqu'un qui vient de dire qu'il ne sait pas contredit exactement
 *   ce qu'il a dit. La base le garantit aussi, par une assertion de 0089.
 */

/* ── L'APPEL ───────────────────────────────────────────────────────────── */

/**
 * ⚠ MÊME RAISON QU'AILLEURS : `integrations/supabase/types.ts` est écrit à la
 *   main et ne connaît pas encore ces fonctions. On déclare la seule forme
 *   utile, et on VALIDE la réponse champ par champ plus bas — `unknown` oblige
 *   à convertir, là où un `any` aurait laissé filer une réponse inattendue
 *   jusqu'au rendu.
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

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const tableau = (v: unknown): Objet[] => (Array.isArray(v) ? v.filter(estObjet) : []);
const texte = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const mot = (v: unknown): string => (typeof v === "string" ? v : "");
const entier = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const distance = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/* ── LES ENVIES ────────────────────────────────────────────────────────── */

export interface Envie {
  code: string;
  label: string;
  /** Ce qu'on annonce avant d'ouvrir la liste. Pas un compte : il vient de la
   *  base, on ne l'écrit pas en dur — un chiffre appris par cœur se périme. */
  quoi: string;
  /** `false` = cette envie ne propose rien, et c'est voulu. */
  propose: boolean;
}

export const ENVIES: Envie[] = [
  { code: "nature", label: "nature", quoi: "parcs, réserves, cascades, grottes", propose: true },
  { code: "plage", label: "plage", quoi: "plages et baies", propose: true },
  { code: "trek", label: "trek", quoi: "sommets et points de vue", propose: true },
  { code: "culture", label: "culture", quoi: "patrimoine, musées, sites", propose: true },
  { code: "gastronomie", label: "gastronomie", quoi: "plats malgaches", propose: true },
  { code: "indecis", label: "je ne sais pas encore", quoi: "", propose: false },
];

export const envieDe = (code: string): Envie | undefined =>
  ENVIES.find((e) => e.code === code);

/* ── CE QU'ON PROPOSE ──────────────────────────────────────────────────── */

/** La table d'origine. ⚠ Elle voyage AVEC la référence : sans elle, personne ne
 *  peut savoir si `ref` désigne une plage ou un plat. */
export type TableChoix = "places" | "attractions" | "dishes";

export interface Suggestion {
  ref: string;
  table: TableChoix;
  slug: string;
  nom: string;
  kind: string;
  region: string | null;
  resume: string | null;
  cover_url: string | null;
  cover_credit: string | null;
  /** La ville la plus proche, et à quelle distance. C'est la question qu'on se
   *  pose avant d'y aller — bien plus que les coordonnées. */
  ville: string | null;
  km_ville: number | null;
}

export interface PageSuggestions {
  /** ⚠ LE VRAI TOTAL de l'envie, pas la taille du tableau rendu. Annoncer
   *  « 24 plages » quand il y en a 318 est un compteur menteur. */
  total: number;
  elements: Suggestion[];
  /** `null` quand il n'y a plus rien après. */
  curseur: string | null;
}

const TABLES: TableChoix[] = ["places", "attractions", "dishes"];

function versSuggestion(o: Objet): Suggestion {
  const t = mot(o.table) as TableChoix;
  return {
    ref: mot(o.ref),
    table: TABLES.includes(t) ? t : "attractions",
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    region: texte(o.region),
    resume: texte(o.resume),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    ville: texte(o.ville),
    km_ville: distance(o.km_ville),
  };
}

export async function chargerSuggestions(
  envie: string,
  o: { q?: string | null; region?: string | null; curseur?: string | null; limite?: number } = {}
): Promise<PageSuggestions> {
  const d = await appeler("suggestions_envie", {
    p_envie: envie,
    p_q: o.q?.trim() || null,
    p_region: o.region || null,
    p_curseur: o.curseur || null,
    p_limite: o.limite ?? 24,
  });
  if (!estObjet(d)) return { total: 0, elements: [], curseur: null };
  return {
    total: entier(d.total),
    // ⚠ Une entrée sans référence est écartée : elle serait cliquable et
    //   n'enregistrerait rien, ce qui est le pire des deux.
    elements: tableau(d.elements).map(versSuggestion).filter((s) => s.ref !== ""),
    curseur: texte(d.curseur),
  };
}

/* ── LES CHOIX DU VOYAGEUR ─────────────────────────────────────────────── */

export interface Choix {
  ref: string;
  table: TableChoix;
  slug: string;
  nom: string;
  kind: string;
  cover_url: string | null;
}

/** ⚠ ENREGISTRE L'ÉTAT COMPLET, pas un ajout. La fonction en base remplace les
 *  trois tableaux : envoyer un sous-ensemble EFFACE le reste. C'est voulu —
 *  un « ajouter » sans « retirer » laisserait des choix qu'on ne peut plus
 *  défaire. */
export async function enregistrerChoix(
  projetId: string,
  choix: { ref: string; table: TableChoix }[]
): Promise<void> {
  await appeler("projet_choix", {
    p_id: projetId,
    p_refs: choix.map((c) => ({ ref: c.ref, table: c.table })),
  });
}

export async function relireChoix(projetId: string): Promise<Choix[]> {
  const d = await appeler("projet_choix_lus", { p_id: projetId });
  return tableau(d)
    .map((o) => {
      const t = mot(o.table) as TableChoix;
      return {
        ref: mot(o.ref),
        table: TABLES.includes(t) ? t : "attractions",
        slug: mot(o.slug),
        nom: mot(o.nom),
        kind: mot(o.kind),
        cover_url: texte(o.cover_url),
      };
    })
    .filter((c) => c.ref !== "");
}

/** Où mène un choix quand on clique dessus. ⚠ Les trois tables ont trois
 *  écrans différents ; un lien fabriqué au petit bonheur rendrait 404. */
export function lienDuChoix(c: { table: TableChoix; slug: string }): string {
  if (c.table === "places") return `/lieu/${c.slug}`;
  if (c.table === "dishes") return `/plat/${c.slug}`;
  return `/site/${c.slug}`;
}
