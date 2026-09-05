import { supabase } from "@/integrations/supabase/client";

/**
 * ACCÈS AUX DONNÉES DE L'ÉCRAN DESTINATIONS — les lieux emblématiques.
 *
 * Même discipline que `api.ts`, `explorer.ts` et `sites.ts` : l'écran ne parle
 * jamais à Supabase, il appelle ce fichier.
 *
 * 🔴 CE QUE ÇA REMPLACE. « Destinations » ouvrait la descente administrative
 *    régions › villes : recompté le 01/09/2026, le compteur « 508 destinations »
 *    recouvrait 208 villages, 87 hameaux, 72 villes et 63 quartiers — et
 *    seulement 61 lieux qu'un voyageur appellerait une destination : les genres
 *    `ile`, `plage`, `parc`, `site`, `zone_touristique` du référentiel. Ces 61
 *    fiches portent TOUTES un résumé et 39 une photo créditée : Nosy Iranja,
 *    l'Isalo, le Tsingy de Bemaraha, l'Allée des Baobabs étaient enterrés sous
 *    la géographie communale. Cet écran ne sert plus qu'eux ; les villes ont
 *    leur propre écran, `/villes`.
 *
 * ⚠ DEUX CHEMINS DE LECTURE, ET C'EST TEMPORAIRE. La fonction
 *   `destinations_emblematiques()` (migration 0117) rend les compteurs par
 *   lieu (établissements, récits, saison renseignée) — mais le classificateur
 *   de la session ne peut pas écrire en base, la migration attend donc son
 *   application manuelle (docs/A-APPLIQUER.md). Plutôt que de laisser l'écran
 *   mort jusque-là, on tente la fonction et on se replie sur une lecture
 *   directe de `places` : mêmes 61 fiches, sans les compteurs. Un compteur
 *   INCONNU vaut `null` et la carte n'affiche rien — jamais un zéro inventé.
 *
 * ⚠ PAS DE PAGINATION : 61 lignes, résumés compris, tiennent dans une réponse.
 *   Le plafond silencieux de PostgREST est à 1 000 lignes ; le garde-fou
 *   `limit(400)` du repli est le même contrat que `explorer.ts` — le jour où
 *   le référentiel emblématique s'en approche, c'est la pagination qu'il
 *   faudra, pas un plafond plus haut.
 */

/* ── LE CONTRAT ────────────────────────────────────────────────────────── */

export interface DestinationEmblematique {
  slug: string;
  nom: string;
  kind: string;
  region: string | null;
  summary: string | null;
  cover_url: string | null;
  cover_credit: string | null;
  /** La ville d'appui (« près de Morondava »). `null` = pas de rattachement. */
  ville: string | null;
  /** `null` = INCONNU (repli sans la fonction 0117), à distinguer de `false`. */
  saisons: boolean | null;
  /** `null` = inconnu ; `0` = compté et nul. La carte ne montre que > 0. */
  nb_etablissements: number | null;
  nb_recits: number | null;
}

export interface Destinations {
  total: number;
  elements: DestinationEmblematique[];
}

/**
 * Les familles de l'écran, dans l'ordre d'affichage — les plus photogéniques
 * d'abord (mesuré le 01/09/2026 : 12 photos sur 13 îles, 7 sur 12 plages).
 *
 * ⚠ AUCUNE CARTE NE PEUT SE PERDRE : un `kind` que cette table ne connaît pas
 *   tombe dans un dernier groupe visible (voir `grouperParFamille`), jamais
 *   dans le vide — le piège déjà verrouillé sur les régions d'Explorer.
 */
export const FAMILLES: { kind: string; titre: string; sousTitre: string }[] = [
  { kind: "ile", titre: "Îles et archipels", sousTitre: "De Nosy Be à Sainte-Marie, les îles qui font la réputation du pays." },
  { kind: "plage", titre: "Plages et lagons", sousTitre: "Sable blanc, villages de pêcheurs et lagons des deux côtes." },
  { kind: "parc", titre: "Parcs et réserves", sousTitre: "Lémuriens, tsingy et forêts : la nature qu'on ne voit qu'ici." },
  { kind: "site", titre: "Merveilles naturelles", sousTitre: "Baobabs, canaux, caps et lacs — les paysages qui valent le détour." },
  { kind: "zone_touristique", titre: "Escapades", sousTitre: "Des coins entiers à vivre, entre volcans, lacs et villages d'artisans." },
];

export interface Famille {
  kind: string;
  titre: string;
  sousTitre: string | null;
  cartes: DestinationEmblematique[];
}

export function grouperParFamille(elements: DestinationEmblematique[]): Famille[] {
  const restant = new Map(elements.map((e) => [e.slug, e]));
  const groupes: Famille[] = FAMILLES.map((f) => {
    const cartes = elements.filter((e) => e.kind === f.kind);
    cartes.forEach((c) => restant.delete(c.slug));
    return { kind: f.kind, titre: f.titre, sousTitre: f.sousTitre, cartes };
  });
  if (restant.size > 0) {
    groupes.push({
      kind: "autres",
      titre: "Autres lieux",
      sousTitre: null,
      cartes: [...restant.values()],
    });
  }
  return groupes.filter((g) => g.cartes.length > 0);
}

/* ── CONVERSION — une réponse inattendue ne fait pas tomber l'écran ─────── */

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const texte = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const mot = (v: unknown): string => (typeof v === "string" ? v : "");

/** `null` reste `null` : un compteur inconnu ne devient jamais un zéro. */
const entierOuInconnu = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function versDestination(o: Objet, compteursConnus: boolean): DestinationEmblematique {
  return {
    slug: mot(o.slug),
    nom: mot(o.nom),
    kind: mot(o.kind),
    region: texte(o.region),
    summary: texte(o.summary),
    cover_url: texte(o.cover_url),
    cover_credit: texte(o.cover_credit),
    ville: texte(o.ville),
    saisons: compteursConnus ? o.saisons === true : null,
    nb_etablissements: compteursConnus ? entierOuInconnu(o.nb_etablissements) : null,
    nb_recits: compteursConnus ? entierOuInconnu(o.nb_recits) : null,
  };
}

/* ── L'APPEL ───────────────────────────────────────────────────────────── */

/**
 * ⚠ Même raccourci que `explorer.ts`, pour la même raison : `types.ts` est
 *   régénéré depuis la base, et la fonction 0117 n'y figurera qu'une fois la
 *   migration appliquée. `unknown` oblige à convertir champ par champ.
 */
type AppelRpc = {
  rpc: (nom: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function chargerDestinations(): Promise<Destinations> {
  // ① La fonction, quand elle existe : compteurs par lieu et tri fait en base.
  try {
    const { data, error } = await (supabase as unknown as AppelRpc).rpc(
      "destinations_emblematiques"
    );
    if (!error && estObjet(data) && Array.isArray(data.elements)) {
      const elements = (data.elements as unknown[])
        .filter(estObjet)
        .map((o) => versDestination(o, true))
        .filter((d) => d.slug !== "");
      return { total: elements.length, elements };
    }
  } catch {
    /* la fonction n'est pas encore en base : on lit la table */
  }

  // ② Le repli : les mêmes 61 fiches, sans les compteurs.
  //   ⚠ Colonnes ÉNUMÉRÉES — un `select('*')` anonyme rend 401 sur ce dépôt.
  const { data, error } = await supabase
    .from("places")
    .select("slug,name_fr,kind,region,summary,cover_url,cover_credit")
    .in("kind", ["ile", "plage", "parc", "site", "zone_touristique"])
    .is("merged_into", null)
    .limit(400);
  if (error) throw new Error(error.message);

  const elements = (data ?? [])
    .map((o) =>
      versDestination(
        { ...o, nom: (o as Objet).name_fr, ville: null } as Objet,
        false
      )
    )
    .filter((d) => d.slug !== "")
    // Le même ordre que la fonction : la photo d'abord, puis le résumé, puis
    // l'alphabet — départagé au slug pour rester stable d'un rendu à l'autre.
    .sort((a, b) =>
      Number(a.cover_url === null) - Number(b.cover_url === null) ||
      Number(a.summary === null) - Number(b.summary === null) ||
      a.nom.localeCompare(b.nom, "fr") ||
      a.slug.localeCompare(b.slug)
    );
  return { total: elements.length, elements };
}
