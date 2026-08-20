import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * Accès aux données des ÉTABLISSEMENTS et des RÉFÉRENTIELS.
 *
 * Prolongement de src/lib/api.ts, qui reste la couche du social (fil,
 * réactions, messages). Même discipline : colonnes énumérées, jamais de
 * `.single()` en écriture, pagination par curseur.
 *
 * Tout ce qui est lecture publique passe par une RPC `security definer` :
 * une fiche complète en UN aller-retour plutôt que huit requêtes — sur une
 * 3G malgache, les allers-retours coûtent plus cher que la charge utile.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

export type Categorie =
  | "hotel"
  | "restaurant"
  | "agence_voyage"
  | "guide"
  | "transporteur"
  | "location_vehicule"
  | "site_attraction"
  | "organisateur_evenement";

export const CATEGORIES: { code: Categorie; label: string; pluriel: string }[] = [
  { code: "hotel", label: "Hôtel", pluriel: "Hôtels et hébergements" },
  { code: "restaurant", label: "Restaurant", pluriel: "Restaurants et tables" },
  { code: "agence_voyage", label: "Agence de voyage", pluriel: "Agences de voyage" },
  { code: "guide", label: "Guide", pluriel: "Guides" },
  { code: "transporteur", label: "Transporteur", pluriel: "Transporteurs" },
  { code: "location_vehicule", label: "Location de véhicule", pluriel: "Location de véhicules" },
  { code: "site_attraction", label: "Site à visiter", pluriel: "Sites à visiter" },
  { code: "organisateur_evenement", label: "Événementiel", pluriel: "Organisateurs d'événements" },
];

export interface Suggestion {
  type: "lieu" | "plat";
  slug: string;
  libelle: string;
  detail: string | null;
  score: number;
}

export interface ResultatPage {
  id: string;
  slug: string;
  name: string;
  categories: string[];
  short_desc: string | null;
  cover_url: string | null;
  place_slug: string | null;
  place_name: string | null;
  landmark: string | null;
  price_min_ar: number | null;
  price_min_unit: string | null;
  rating_avg: number;
  rating_count: number;
  verification_status: string;
  completeness: number;
  prix_du_plat: number | null;
  /** Position du résultat, pour la carte à côté de la liste (écran W2).
   *  ⚠ C'est le centre de la commune quand la fiche n'a pas d'épingle propre —
   *  `precision_geo` dit laquelle des deux, et l'écran l'annonce. */
  lat: number | null;
  lng: number | null;
  precision_geo: "exacte" | "lieu" | null;
}

export interface Tarif {
  id: string;
  season_label: string;
  from_date: string | null;
  to_date: string | null;
  price_ar: number;
  price_unit: string;
  board: string | null;
  min_nights: number;
  resident_price_ar: number | null;
}

export interface Chambre {
  id: string;
  name: string;
  description: string | null;
  photos: string[];
  units_count: number;
  max_adults: number | null;
  max_children: number | null;
  surface_m2: number | null;
  private_bath: boolean;
  hot_water: boolean;
  view: string | null;
  base_price_ar: number;
  price_unit: string;
  extra_person_ar: number | null;
  status: string;
  rates: Tarif[];
}

export interface PlatCarte {
  id: string;
  section_id: string | null;
  name: string;
  dish_id: string | null;
  dish_slug: string | null;
  description: string | null;
  price_ar: number | null;
  price_unit: string;
  photo_url: string | null;
  availability: string;
  tags: string[];
  side_dish: string | null;
  is_signature: boolean;
  in_stock: boolean;
}

export interface Activite {
  id: string;
  name: string;
  description: string | null;
  photos: string[];
  duration_h: number | null;
  price_ar: number | null;
  price_unit: string;
  min_people: number | null;
  max_people: number | null;
  includes: string[];
}

export interface Circuit {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  duration_days: number;
  duration_nights: number | null;
  difficulty: string | null;
  format: string | null;
  group_min: number | null;
  group_max: number | null;
  axe: string | null;
  transports: string[];
  guide_langs: string[];
  parks_included: boolean;
  months_open: number[] | null;
  photos: string[];
  days: { jour: number; titre: string; detail: string | null; nuitee: string | null }[];
  prices: { base_pax: number; price_ar: number; price_unit: string }[];
  inclusions: { libelle: string; inclus: boolean }[];
}

export interface Fiche {
  id: string;
  slug: string;
  name: string;
  owner_id: string | null;
  categories: string[];
  subcategory: string | null;
  short_desc: string | null;
  long_desc: string | null;
  address: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
  logo_url: string | null;
  cover_url: string | null;
  cover_offset_y: number;
  gallery: string[];
  languages: string[];
  payment_methods: string[];
  price_level: number | null;
  verification_status: string;
  is_published: boolean;
  rating_avg: number;
  rating_count: number;
  price_min_ar: number | null;
  price_min_unit: string | null;
  rates_checked_at: string | null;
  completeness: number;
  /** Provenance quand la fiche est editoriale (owner_id null). */
  source: string | null;
  place: { id: string; slug: string; name: string; region: string | null } | null;
  amenities: { code: string; label: string; category: string }[];
  hours: {
    jour: number;
    ouvre: string | null;
    ferme: string | null;
    ferme_journee: boolean;
  }[];
  rooms: Chambre[];
  menu_sections: { id: string; name: string; service: string | null }[];
  menu_items: PlatCarte[];
  menu_photos: { url: string; legende: string | null }[];
  activities: Activite[];
  tours: Circuit[];
}

export interface Lieu {
  id: string;
  slug: string;
  name_fr: string;
  name_mg: string | null;
  kind: string;
  region: string | null;
  axe: string | null;
  is_touristique: boolean;
  summary: string | null;
  why_go: string[] | null;
  nb_pages: number;
  nb_posts: number;
  lat: number | null;
  lng: number | null;
  /** Couverture de la destination, posée en 0082. Nulle sur l'immense majorité
   *  des 18 345 lieux : l'écran doit savoir s'en passer, et non afficher un
   *  cadre gris là où il n'y a rien. */
  cover_url: string | null;
  cover_credit: string | null;
}

export interface Plat {
  id: string;
  slug: string;
  name_fr: string;
  name_mg: string | null;
  family: string | null;
  description: string | null;
  is_vegetarian: boolean;
  has_pork: boolean;
  has_seafood: boolean;
  price_min_ar: number | null;
  price_max_ar: number | null;
  nb_restaurants: number;
}

/* ── Recherche et autocomplétion ───────────────────────────────────────── */

/**
 * Autocomplétion unifiée : lieux ET plats en un seul appel.
 * Un seul aller-retour, sinon la barre de recherche en déclenche deux par
 * frappe.
 */
export async function suggerer(terme: string, limite = 8): Promise<Suggestion[]> {
  const t = terme.trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase.rpc("suggerer", { p_terme: t, p_limite: limite });
  if (error) throw error;
  return (data as unknown as Suggestion[]) ?? [];
}

/** Résout un terme libre en destination du référentiel. « majunga » → Mahajanga. */
export async function resoudreLieu(terme: string, limite = 5) {
  const t = terme.trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc("resoudre_lieu", { p_terme: t, p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

/** Résout un terme libre en plat du référentiel. « ravi-toto » → Ravitoto. */
export async function resoudrePlat(terme: string, limite = 5) {
  const t = terme.trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc("resoudre_plat", { p_terme: t, p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

export interface FiltresRecherche {
  lieu?: string | null;
  categorie?: string | null;
  prixMax?: number | null;
  plat?: string | null;
  /** Codes d'équipements — TOUS exigés. « avec piscine ET wifi ». */
  equipements?: string[] | null;
  /** Curseur keyset : [complétude, id] du dernier résultat reçu. */
  curseur?: [number, string] | null;
  limite?: number;
}

export async function chercherPages(f: FiltresRecherche = {}): Promise<ResultatPage[]> {
  const { data, error } = await supabase.rpc("chercher_pages", {
    p_lieu: f.lieu ?? undefined,
    p_categorie: f.categorie ?? undefined,
    p_prix_max: f.prixMax ?? undefined,
    p_plat: f.plat ?? undefined,
    p_curseur_score: f.curseur?.[0] ?? undefined,
    p_curseur_id: f.curseur?.[1] ?? undefined,
    p_limite: f.limite ?? 12,
    p_equipements: f.equipements ?? undefined,
  });
  if (error) throw error;
  return (data as ResultatPage[]) ?? [];
}

/**
 * « Où manger du ravitoto » — la promesse centrale du produit.
 * Rend les restaurants qui le servent AVEC le prix chez chacun.
 */
export async function restaurantsParPlat(plat: string, lieu?: string | null, limite = 20) {
  const { data, error } = await supabase.rpc("restaurants_par_plat", {
    p_plat: plat,
    p_lieu: lieu ?? undefined,
    p_limite: limite,
  });
  if (error) throw error;
  return data ?? [];
}

/* ── La fiche publique ─────────────────────────────────────────────────── */

/** `null` = fiche inexistante. L'appelant doit afficher une 404, jamais une autre fiche. */
export async function chargerFiche(slug: string): Promise<Fiche | null> {
  const { data, error } = await supabase.rpc("get_page_by_slug", { p_slug: slug });
  if (error) throw error;
  return (data as unknown as Fiche | null) ?? null;
}

/** Ouvre (ou retrouve) la conversation avec le gérant, rattachée à la page. */
export async function ecrireALEtablissement(pageId: string): Promise<string> {
  const { data, error } = await supabase.rpc("ouvrir_conversation_page", { p_page: pageId });
  if (error) throw error;
  return data as string;
}

/* ── Référentiels ──────────────────────────────────────────────────────── */

/**
 * Les destinations mises en avant : celles marquées touristiques.
 *
 * 🔴 UNE LIMITE FIXE EST UN PIÈGE QUI SE REFERME TOUT SEUL. Le catalogue est
 *    passé de 87 à 524 destinations le jour où les lieux abritant un parc, une
 *    cascade ou un musée y sont entrés — et la limite de 200, posée quand il y
 *    en avait 87, a recommencé à en couper 324 EN SILENCE. C'est la deuxième
 *    fois que ce même écran perd des destinations de cette façon.
 *
 * ⚠ D'OÙ LA PAGINATION PAR CURSEUR, et non une limite relevée une fois de plus.
 *   Le curseur est le nom, seul ordre TOTAL et STABLE disponible : trier par
 *   `nb_posts` d'abord ferait remonter les mêmes lieux à chaque page.
 *
 * ⚠ ET UN PLAFOND DUR À 1 000 CÔTÉ POSTGREST, qu'on demande ou non davantage.
 *   Une limite qu'on demande n'est pas une limite qu'on obtient.
 */
export async function chargerDestinations(
  limite = 60,
  apres?: string | null,
  /** Une ou plusieurs régions administratives. Une GRANDE région en contient
   *  plusieurs — d'où `in` et non `eq` : filtrer « Côte Est » revient à demander
   *  six régions d'un coup, pas à inventer une colonne « grande région ». */
  regions?: string[] | null
): Promise<Lieu[]> {
  let r = supabase
    .from("places")
    .select(
      // ⚠ UNE SEULE CHAÎNE LITTÉRALE. PostgREST ne déduit le type du résultat
      //   qu'à partir d'un littéral : coupée en deux avec un `+`, la liste
      //   devient une `string` quelconque et le retour dégénère en
      //   `GenericStringError[]`. La ligne est longue, mais la couper coûte
      //   le typage de tout l'appel.
      "id, slug, name_fr, name_mg, kind, region, axe, is_touristique, summary, why_go, nb_pages, nb_posts, lat, lng, cover_url, cover_credit"
    )
    .eq("is_touristique", true);
  if (regions?.length) r = r.in("region", regions);
  if (apres) r = r.gt("name_fr", apres);
  const { data, error } = await r.order("name_fr").limit(Math.min(limite, 1000));
  if (error) throw error;
  return (data as Lieu[]) ?? [];
}

/** Combien de destinations en tout — pour que l'écran annonce un chiffre vrai
 *  et non le nombre de vignettes qu'il a réussi à charger. */
export async function compterDestinations(regions?: string[] | null): Promise<number> {
  let r = supabase
    .from("places")
    .select("id", { count: "exact", head: true })
    .eq("is_touristique", true);
  // ⚠ LE COMPTE SUIT LE FILTRE. Annoncer « 520 destinations » au-dessus d'une
  //   liste filtrée qui en montre 81 est le genre de compteur menteur qu'on a
  //   déjà corrigé ailleurs : le chiffre doit décrire ce qu'on voit.
  if (regions?.length) r = r.in("region", regions);
  const { count, error } = await r;
  if (error) throw error;
  return count ?? 0;
}

export async function chargerLieu(slug: string): Promise<Lieu | null> {
  const { data, error } = await supabase
    .from("places")
    .select(
      // ⚠ UNE SEULE CHAÎNE LITTÉRALE. PostgREST ne déduit le type du résultat
      //   qu'à partir d'un littéral : coupée en deux avec un `+`, la liste
      //   devient une `string` quelconque et le retour dégénère en
      //   `GenericStringError[]`. La ligne est longue, mais la couper coûte
      //   le typage de tout l'appel.
      "id, slug, name_fr, name_mg, kind, region, axe, is_touristique, summary, why_go, nb_pages, nb_posts, lat, lng, cover_url, cover_credit"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Lieu) ?? null;
}

/** Saisonnalité d'une destination : douze lignes au plus. */
export async function chargerSaisons(placeId: string) {
  const { data, error } = await supabase
    .from("place_seasons")
    .select("month, rating, reason")
    .eq("place_id", placeId)
    .order("month");
  if (error) throw error;
  return data ?? [];
}

/** Le référentiel des plats, pour l'autocomplétion de la carte et des récits. */
export async function chargerPlats(limite = 200): Promise<Plat[]> {
  const { data, error } = await supabase
    .from("dishes")
    .select(
      "id, slug, name_fr, name_mg, family, description, is_vegetarian, has_pork, has_seafood, price_min_ar, price_max_ar, nb_restaurants"
    )
    .order("nb_restaurants", { ascending: false })
    .order("name_fr")
    .limit(limite);
  if (error) throw error;
  return (data as Plat[]) ?? [];
}

export async function chargerEquipements(pour?: string) {
  let q = supabase
    .from("amenities")
    .select("code, label_fr, category, applies_to, rang")
    .order("rang");
  if (pour) q = q.contains("applies_to", [pour]);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/* ── Espace professionnel ──────────────────────────────────────────────── */

/** Les deux façons d'avoir la main sur une page. Ce sont les codes rendus par
 *  la base — sans accent, ce ne sont pas des libellés d'écran. */
export type RolePage = "proprietaire" | "gestionnaire";

/** Une page de mon espace pro, et À QUEL TITRE je l'ai. */
export interface MonEtablissement {
  id: string;
  slug: string;
  name: string;
  categories: string[];
  cover_url: string | null;
  is_published: boolean;
  completeness: number;
  rating_avg: number;
  rating_count: number;
  views_count: number;
  price_min_ar: number | null;
  price_min_unit: string | null;
  /**
   * ⚠ CE CHAMP N'EST PAS DÉCORATIF. Un gestionnaire tient les chambres, la
   *   carte, les activités et les circuits — il ne peut NI céder la page, NI
   *   nommer un autre gestionnaire : le déclencheur `pages_avant_ecriture` gèle
   *   `owner_id`, et la policy `pg_proprietaire` réserve les invitations au
   *   propriétaire. Un écran qui ne fait pas la différence promet des gestes
   *   que la base refusera, et un refus de la base se lit comme une panne.
   */
  mon_role: RolePage;
}

/**
 * ⚠ `mes_etablissements` N'EST PAS DANS `types.ts`. La fonction existe en base
 *   depuis 0076 et change de signature en 0085, sans que les types soient
 *   régénérés — `types.ts` reste hors du périmètre de ce chantier. On la
 *   déclare donc ICI, une seule fois, avec sa vraie forme, plutôt que de semer
 *   des `as any` de fichier en fichier, ce que l'entête de `types.ts` interdit
 *   explicitement (« chaque contournement est un bug futur »). C'est le même
 *   procédé que dans `Cogestion.tsx` pour `page_gestionnaires` ; le jour où les
 *   types seront régénérés, ce bloc et `basePro` disparaissent sans qu'une
 *   seule requête change.
 */
type SchemaEspacePro = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      mes_etablissements: {
        Args: { p_limite?: number };
        Returns: MonEtablissement[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

const basePro = supabase as unknown as SupabaseClient<SchemaEspacePro>;

/**
 * Les établissements que je peux gérer : ceux que je POSSÈDE et ceux dont on
 * m'a nommé gestionnaire.
 *
 * 🔴 CETTE LISTE NE MONTRAIT QUE `owner_id`, ET C'ÉTAIT UNE IMPASSE. C'est le
 *    seul chargement de l'écran /pro, et le lien « Gérer » qu'il porte est l'un
 *    des deux seuls du dépôt vers /pro/:slug. Un gestionnaire nommé en bonne et
 *    due forme — à qui la base accorde déjà chambres, carte, activités,
 *    circuits et réponses aux avis depuis 0076 — n'avait donc AUCUN geste pour
 *    ouvrir la page qu'il gère. La co-gestion existait en base, en RLS et à
 *    l'écran, mais restait inatteignable.
 *
 * ⚠ ON PASSE PAR UNE RPC, ET CE N'EST PAS UN CONFORT. La policy `pages_lecture`
 *   dit `is_published or owner_id = auth.uid() or is_staff()` : le gestionnaire
 *   n'y figure pas. Une requête sur `pages` depuis le navigateur, si habilement
 *   filtrée soit-elle, ne rendrait JAMAIS la fiche non publiée qu'il gère — la
 *   RLS la retire sans erreur, et la liste serait fausse EN SILENCE. C'est
 *   exactement la fiche en cours de remplissage qu'on confie à un gestionnaire.
 *   La fonction est `security definer` et énumère elle-même les deux titres
 *   d'accès ; c'est la seule façon d'obtenir une liste complète sans ouvrir la
 *   lecture de `pages` à tout le monde.
 *
 * ⚠ COLONNES ÉNUMÉRÉES : elles le sont dans la table de retour de la fonction,
 *   côté base. Le client ne reçoit que celles-là.
 *
 * ⚠ ET UN PLAFOND, PARCE QUE POSTGREST COUPE À 1 000 LIGNES SANS RIEN DIRE.
 *   La borne est portée par `p_limite` et bridée à 500 dans la fonction : une
 *   limite qu'on écrit vaut mieux qu'une limite qu'on subit. Aucun gérant n'en
 *   tient autant — mais c'est précisément ce qu'on disait des 87 destinations
 *   devenues 524.
 *
 * ⚠ PAS DE `supabase.auth.getUser()` AVANT L'APPEL. Il coûtait un aller-retour
 *   réseau pour une garde que l'écran fait déjà, et que la base fait mieux :
 *   `mes_etablissements` est révoquée à `anon`, donc un appel sans session
 *   échoue au lieu de rendre une liste rassurante et vide.
 */
export async function mesEtablissements(limite = 200): Promise<MonEtablissement[]> {
  const { data, error } = await basePro.rpc("mes_etablissements", { p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fabrique un identifiant d'URL lisible et unique.
 * On suffixe en cas de collision plutôt que d'échouer : un gérant ne doit pas
 * buter sur « ce nom est déjà pris » alors qu'il tient à son enseigne.
 */
export async function slugLibre(nom: string): Promise<string> {
  const base =
    nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "etablissement";

  const { data } = await supabase.from("pages").select("slug").like("slug", `${base}%`);
  const pris = new Set((data ?? []).map((r) => r.slug));
  if (!pris.has(base)) return base;
  for (let i = 2; i < 200; i++) if (!pris.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

export async function creerEtablissement(entree: {
  name: string;
  categories: string[];
  place_id?: string | null;
  short_desc?: string | null;
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  const slug = await slugLibre(entree.name);
  const { data, error } = await supabase
    .from("pages")
    .insert({
      owner_id: user.id,
      slug,
      name: entree.name.trim(),
      categories: entree.categories,
      place_id: entree.place_id ?? null,
      short_desc: entree.short_desc?.trim() || null,
    })
    .select("slug")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("L'établissement n'a pas pu être créé.");
  return data.slug;
}

export async function majEtablissement(id: string, champs: TablesUpdate<"pages">): Promise<void> {
  const { error } = await supabase.from("pages").update(champs).eq("id", id);
  if (error) throw error;
}

export async function definirEquipements(pageId: string, codes: string[]): Promise<void> {
  const { error: eSuppr } = await supabase.from("page_amenities").delete().eq("page_id", pageId);
  if (eSuppr) throw eSuppr;
  if (!codes.length) return;
  const { error } = await supabase
    .from("page_amenities")
    .insert(codes.map((code) => ({ page_id: pageId, code })));
  if (error) throw error;
}

/* ── Chambres ──────────────────────────────────────────────────────────── */

export async function chambresDe(pageId: string) {
  const { data, error } = await supabase
    .from("room_types")
    .select(
      "id, name, description, photos, units_count, max_adults, max_children, surface_m2, private_bath, hot_water, view, base_price_ar, price_unit, extra_person_ar, status, sort_order"
    )
    .eq("page_id", pageId)
    .order("sort_order")
    .order("base_price_ar");
  if (error) throw error;
  return data ?? [];
}

export async function enregistrerChambre(
  pageId: string,
  chambre: Omit<TablesInsert<"room_types">, "page_id"> & { id?: string }
): Promise<string> {
  const { id, ...champs } = chambre;
  if (id) {
    const { error } = await supabase.from("room_types").update(champs).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("room_types")
    .insert({ ...champs, page_id: pageId })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La chambre n'a pas pu être enregistrée.");
  return data.id;
}

export async function supprimerChambre(id: string) {
  const { error } = await supabase.from("room_types").delete().eq("id", id);
  if (error) throw error;
}

export async function tarifsDe(roomTypeId: string) {
  const { data, error } = await supabase
    .from("season_rates")
    .select(
      "id, season_label, from_date, to_date, price_ar, price_unit, board, min_nights, resident_price_ar"
    )
    .eq("room_type_id", roomTypeId)
    .order("from_date", { nullsFirst: true });
  if (error) throw error;
  return data ?? [];
}

export async function enregistrerTarif(
  roomTypeId: string,
  tarif: Omit<TablesInsert<"season_rates">, "room_type_id"> & { id?: string }
): Promise<void> {
  const { id, ...champs } = tarif;
  if (id) {
    const { error } = await supabase.from("season_rates").update(champs).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("season_rates")
    .insert({ ...champs, room_type_id: roomTypeId });
  if (error) throw error;
}

export async function supprimerTarif(id: string) {
  const { error } = await supabase.from("season_rates").delete().eq("id", id);
  if (error) throw error;
}

/* ── Carte ─────────────────────────────────────────────────────────────── */

export async function carteDe(pageId: string) {
  const [sections, plats] = await Promise.all([
    supabase
      .from("menu_sections")
      .select("id, name, service, sort_order")
      .eq("page_id", pageId)
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select(
        "id, section_id, name, dish_id, description, price_ar, price_unit, photo_url, availability, tags, side_dish, is_signature, in_stock, sort_order"
      )
      .eq("page_id", pageId)
      .order("sort_order"),
  ]);
  if (sections.error) throw sections.error;
  if (plats.error) throw plats.error;
  return { sections: sections.data ?? [], plats: plats.data ?? [] };
}

export async function enregistrerSection(
  pageId: string,
  section: { id?: string; name: string; service?: string | null; sort_order?: number }
): Promise<string> {
  const { id, ...champs } = section;
  if (id) {
    const { error } = await supabase.from("menu_sections").update(champs).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("menu_sections")
    .insert({ ...champs, page_id: pageId })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La section n'a pas pu être enregistrée.");
  return data.id;
}

export async function supprimerSection(id: string) {
  const { error } = await supabase.from("menu_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function enregistrerPlat(
  pageId: string,
  plat: Omit<TablesInsert<"menu_items">, "page_id"> & { id?: string }
): Promise<void> {
  const { id, ...champs } = plat;
  if (id) {
    const { error } = await supabase.from("menu_items").update(champs).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("menu_items")
    .insert({ ...champs, page_id: pageId });
  if (error) throw error;
}

export async function supprimerPlat(id: string) {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Mode dégradé de la carte : la photo du menu papier.
 * Sans cette échappatoire, une gargote de 45 plats ne publiera jamais sa
 * carte — saisir 45 lignes prend une soirée, photographier prend trente
 * secondes.
 */
export async function ajouterPhotoCarte(pageId: string, url: string, legende?: string) {
  const { error } = await supabase
    .from("menu_photos")
    .insert({ page_id: pageId, url, legende: legende ?? null });
  if (error) throw error;
}

export async function supprimerPhotoCarte(id: string) {
  const { error } = await supabase.from("menu_photos").delete().eq("id", id);
  if (error) throw error;
}

/* ── Activités ─────────────────────────────────────────────────────────── */

export async function activitesDe(pageId: string) {
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, name, description, photos, duration_h, price_ar, price_unit, min_people, max_people, includes, sort_order"
    )
    .eq("page_id", pageId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function enregistrerActivite(
  pageId: string,
  activite: Omit<TablesInsert<"activities">, "page_id"> & { id?: string }
): Promise<void> {
  const { id, ...champs } = activite;
  if (id) {
    const { error } = await supabase.from("activities").update(champs).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("activities")
    .insert({ ...champs, page_id: pageId });
  if (error) throw error;
}

export async function supprimerActivite(id: string) {
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw error;
}

/* ── Circuits ──────────────────────────────────────────────────────────── */

export async function circuitsDe(pageId: string) {
  const { data, error } = await supabase
    .from("tours")
    .select(
      "id, slug, title, summary, duration_days, duration_nights, difficulty, format, group_min, group_max, axe, photos"
    )
    .eq("page_id", pageId)
    .order("duration_days");
  if (error) throw error;
  return data ?? [];
}

export async function enregistrerCircuit(
  pageId: string,
  circuit: Omit<TablesInsert<"tours">, "page_id" | "slug"> & { id?: string }
): Promise<string> {
  const { id, ...champs } = circuit;
  if (id) {
    const { error } = await supabase.from("tours").update(champs).eq("id", id);
    if (error) throw error;
    return id;
  }
  const slug = await slugCircuitLibre(circuit.title);
  const { data, error } = await supabase
    .from("tours")
    .insert({ ...champs, page_id: pageId, slug })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Le circuit n'a pas pu être enregistré.");
  return data.id;
}

async function slugCircuitLibre(titre: string): Promise<string> {
  const base =
    titre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "circuit";
  const { data } = await supabase.from("tours").select("slug").like("slug", `${base}%`);
  const pris = new Set((data ?? []).map((r) => r.slug));
  if (!pris.has(base)) return base;
  for (let i = 2; i < 200; i++) if (!pris.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

export async function supprimerCircuit(id: string) {
  const { error } = await supabase.from("tours").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Les jours DEJA saisis d'un circuit.
 *
 * 🔴 CETTE LECTURE N'EXISTAIT PAS, et c'est ce qui rendait l'enregistrement
 *    destructeur. Le formulaire partait toujours de jours VIDES, et
 *    `enregistrerJoursCircuit` supprime avant d'inserer : rouvrir l'itineraire
 *    d'un circuit deja rempli puis enregistrer l'EFFACAIT entierement, sans un
 *    mot. Personne ne l'a rencontre parce qu'aucun circuit n'existe encore ;
 *    ca aurait mordu la premiere agence a en saisir un.
 */
export async function chargerJoursCircuit(tourId: string): Promise<
  { jour: number; titre: string; detail: string | null; nuitee: string | null }[]
> {
  const { data, error } = await supabase
    .from("tour_days")
    .select("jour, titre, detail, nuitee")
    .eq("tour_id", tourId)
    .order("jour");
  if (error) throw error;
  return (data as { jour: number; titre: string; detail: string | null; nuitee: string | null }[]) ?? [];
}

export async function enregistrerJoursCircuit(
  tourId: string,
  jours: { jour: number; titre: string; detail?: string | null; nuitee?: string | null }[]
): Promise<void> {
  // ⚠ ON REFUSE D'EFFACER SUR UN LOT VIDE. « Supprimer puis inserer » est
  //   acceptable pour remplacer un itineraire ; ca ne doit jamais servir a le
  //   vider par accident. Un appel sans jours est presque toujours un
  //   formulaire qui n'a pas fini de charger.
  if (!jours.length) return;
  const { error: eSuppr } = await supabase.from("tour_days").delete().eq("tour_id", tourId);
  if (eSuppr) throw eSuppr;
  const { error } = await supabase
    .from("tour_days")
    .insert(jours.map((j) => ({ ...j, tour_id: tourId })));
  if (error) throw error;
}

export async function enregistrerPrixCircuit(
  tourId: string,
  prix: { base_pax: number; price_ar: number; price_unit?: string }[]
): Promise<void> {
  const { error: eSuppr } = await supabase.from("tour_prices").delete().eq("tour_id", tourId);
  if (eSuppr) throw eSuppr;
  if (!prix.length) return;
  const { error } = await supabase
    .from("tour_prices")
    .insert(prix.map((p) => ({ ...p, tour_id: tourId })));
  if (error) throw error;
}

export async function enregistrerInclusions(
  tourId: string,
  lignes: { libelle: string; inclus: boolean }[]
): Promise<void> {
  const { error: eSuppr } = await supabase.from("tour_inclusions").delete().eq("tour_id", tourId);
  if (eSuppr) throw eSuppr;
  if (!lignes.length) return;
  const { error } = await supabase
    .from("tour_inclusions")
    .insert(lignes.map((l, i) => ({ ...l, tour_id: tourId, sort_order: i })));
  if (error) throw error;
}

/* ── Avis ──────────────────────────────────────────────────────────────── */

export interface Avis {
  id: string;
  note: number;
  body: string | null;
  visite_le: string | null;
  created_at: string;
  author: { id: string; name: string | null; avatar: string | null };
  reponse: { body: string; created_at: string } | null;
}

export async function avisDe(pageId: string, limite = 30): Promise<Avis[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, author_id, note, body, visite_le, created_at")
    .eq("page_id", pageId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  const lignes = data ?? [];
  if (!lignes.length) return [];

  // Deux requêtes annexes plutôt qu'une jointure par ligne : c'est le même
  // anti-N+1 que dans api.ts pour les conversations.
  const [profils, reponses] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", [...new Set(lignes.map((l) => l.author_id))]),
    supabase
      .from("review_replies")
      .select("review_id, body, created_at")
      .in("review_id", lignes.map((l) => l.id)),
  ]);

  const parId = new Map((profils.data ?? []).map((p) => [p.id, p]));
  const parAvis = new Map((reponses.data ?? []).map((r) => [r.review_id, r]));

  return lignes.map((l) => ({
    id: l.id,
    note: l.note,
    body: l.body,
    visite_le: l.visite_le,
    created_at: l.created_at,
    author: {
      id: l.author_id,
      name: parId.get(l.author_id)?.display_name ?? null,
      avatar: parId.get(l.author_id)?.avatar_url ?? null,
    },
    reponse: parAvis.get(l.id)
      ? { body: parAvis.get(l.id)!.body, created_at: parAvis.get(l.id)!.created_at }
      : null,
  }));
}

export async function deposerAvis(
  pageId: string,
  avis: { note: number; body?: string | null; visite_le?: string | null }
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  // Un seul avis par personne et par établissement (contrainte unique en
  // base) : on remplace le sien plutôt que d'échouer.
  const { error } = await supabase.from("reviews").upsert(
    {
      page_id: pageId,
      author_id: user.id,
      note: avis.note,
      body: avis.body?.trim() || null,
      visite_le: avis.visite_le ?? null,
    },
    { onConflict: "page_id,author_id" }
  );
  if (error) throw error;
}

export async function repondreAAvis(reviewId: string, pageId: string, body: string) {
  const { error } = await supabase
    .from("review_replies")
    .upsert({ review_id: reviewId, page_id: pageId, body: body.trim() });
  if (error) throw error;
}

/* ── Mentions dans un récit ────────────────────────────────────────────── */

/** Rattache un récit aux établissements qu'il cite : la fiche affichera le récit. */
export async function mentionner(postId: string, pageIds: string[]): Promise<void> {
  if (!pageIds.length) return;
  const { error } = await supabase
    .from("post_mentions")
    .insert(pageIds.map((page_id) => ({ post_id: postId, page_id })));
  if (error) throw error;
}

/**
 * Les récits publiés sur une destination.
 *
 * C'est le pont qui manquait : les 28 publications rangeaient leur lieu en
 * texte libre, donc la recherche ne pouvait pas les retrouver. Depuis la
 * migration 0005 elles portent un place_id, et on interroge dessus.
 */
export async function recitsParLieu(placeId: string, limite = 6) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, body, place, media, created_at, reactions_count, comments_count")
    .eq("place_id", placeId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

/** Les récits qui citent cet établissement — la preuve sociale de sa fiche. */
export async function recitsMentionnant(pageId: string, limite = 10) {
  const { data, error } = await supabase
    .from("post_mentions")
    .select("post_id")
    .eq("page_id", pageId)
    .limit(limite);
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.post_id);
  if (!ids.length) return [];

  const { data: posts, error: ePosts } = await supabase
    .from("posts")
    .select("id, body, media, place, created_at, author_id, reactions_count, comments_count")
    .in("id", ids)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (ePosts) throw ePosts;
  return (posts ?? []) as unknown as {
    id: string;
    body: string | null;
    media: Json;
    place: string | null;
    created_at: string;
    author_id: string;
    reactions_count: number;
    comments_count: number;
  }[];
}


/* ── Socle de l'agent ──────────────────────────────────────────────────── */

export interface Cuisine {
  slug: string;
  label_fr: string;
  rang: number;
}

export async function chargerCuisines(): Promise<Cuisine[]> {
  const { data, error } = await supabase
    .from("cuisines")
    .select("slug, label_fr, rang")
    .order("rang");
  if (error) throw error;
  return (data as Cuisine[]) ?? [];
}

export async function definirCuisines(pageId: string, slugs: string[]): Promise<void> {
  const { error: eSuppr } = await supabase.from("page_cuisines").delete().eq("page_id", pageId);
  if (eSuppr) throw eSuppr;
  if (!slugs.length) return;
  const { error } = await supabase
    .from("page_cuisines")
    .insert(slugs.map((cuisine_slug) => ({ page_id: pageId, cuisine_slug })));
  if (error) throw error;
}

/**
 * « C'est mon établissement. »
 *
 * Au lancement, les fiches sont saisies par Diako (owner_id null). Un gérant
 * demande à reprendre la sienne ; la demande est vérifiée à la main, jamais
 * accordée automatiquement — accepter un transfert donne accès aux messages
 * des clients, ça ne peut pas dépendre d'un clic.
 */
export interface DossierRevendication {
  message?: string;
  tel?: string;
  /** ⚠ Declaratifs. Leur presence ne prouve RIEN et n'accorde aucun badge :
   *  recopier le meme numero dans les deux cases passe tout controle de forme. */
  nif?: string | null;
  stat?: string | null;
  /** Chemins dans le bucket PRIVE `justificatifs` — jamais des URL publiques. */
  piece?: string | null;
  photoLieu?: string | null;
  role?: string | null;
}

export async function revendiquer(
  pageId: string,
  d: DossierRevendication
): Promise<string> {
  const { data, error } = await supabase.rpc("revendiquer_page", {
    p_page: pageId,
    p_message: d.message || "",
    p_tel: d.tel || "",
    p_nif: d.nif ?? undefined,
    p_stat: d.stat ?? undefined,
    p_piece: d.piece ?? undefined,
    p_photo_lieu: d.photoLieu ?? undefined,
    p_role: d.role ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export interface FiltresAgent {
  lieu?: string | null;
  categorie?: string | null;
  budgetMax?: number | null;
  budgetMin?: number | null;
  equipements?: string[] | null;
  cuisines?: string[] | null;
  plat?: string | null;
  personnes?: number | null;
  limite?: number;
}

/**
 * LA fonction que l'agent Diako appellera.
 *
 * Le partage des rôles est ce qui rend l'ensemble fiable : le modèle de langue
 * traduit « un hôtel à Ampefy avec piscine chauffée à 200 000 Ar » en filtres,
 * cette fonction répond avec des faits pris en base, et le modèle reformule.
 * L'agent ne peut citer que ce qui lui est rendu — donc il ne peut pas inventer
 * un hôtel, un prix ou une piscine.
 *
 * `p_equipements` exige TOUS les équipements ; `p_cuisines` en accepte au moins
 * un. C'est la façon dont on parle : « avec piscine ET wifi », « japonais OU
 * thaï ».
 */
export async function agentChercher(f: FiltresAgent = {}): Promise<unknown[]> {
  const { data, error } = await supabase.rpc("agent_chercher", {
    p_lieu: f.lieu ?? undefined,
    p_categorie: f.categorie ?? undefined,
    p_budget_max: f.budgetMax ?? undefined,
    p_budget_min: f.budgetMin ?? undefined,
    p_equipements: f.equipements ?? undefined,
    p_cuisines: f.cuisines ?? undefined,
    p_plat: f.plat ?? undefined,
    p_personnes: f.personnes ?? undefined,
    p_limite: f.limite ?? 10,
  });
  if (error) throw error;
  return (data as unknown[]) ?? [];
}

export interface EtapeItineraire {
  etape: string;
  slug: string;
  type: string;
  region: string | null;
  resume: string | null;
  a_voir: string[] | null;
  km_depuis_le_depart: number | null;
  heures_de_route_cumulees: number | null;
  derniere_etape: {
    depuis: string;
    distance_km: number | null;
    duree_h: number | null;
    mode: string;
    etat_route: string | null;
    ouvert_toute_l_annee: boolean;
    transporteurs: string[] | null;
    prix_ar: number | null;
  } | null;
  saison_ce_mois: { note: string; raison: string | null } | null;
  nb_etablissements: number;
  nb_recits: number;
  a_partir_de_ar: number | null;
}

/** Les étapes d'un axe, ordonnées par distance cumulée depuis le départ. */
export async function itineraire(axe: string, depuis = "antananarivo"): Promise<EtapeItineraire[]> {
  const { data, error } = await supabase.rpc("itineraire_axe", { p_axe: axe, p_depuis: depuis });
  if (error) throw error;
  return (data as unknown as EtapeItineraire[]) ?? [];
}

/** « Comment aller à… » — les trajets connus au départ d'un lieu. */
export async function trajetsDepuis(slug: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc("trajets_depuis", { p_lieu: slug });
  if (error) throw error;
  return (data as unknown[]) ?? [];
}

export const AXES: { code: string; label: string }[] = [
  { code: "rn7-sud", label: "Le Sud, par la RN7" },
  { code: "nord", label: "Le Nord, autour de Diego" },
  { code: "est", label: "L'Est et la côte des épices" },
  { code: "ouest-baobabs", label: "L'Ouest et les baobabs" },
  { code: "sava", label: "La SAVA, pays de la vanille" },
  { code: "sud-est", label: "Le Sud-Est" },
  { code: "hautes-terres", label: "Les Hautes Terres" },
  { code: "extreme-sud", label: "L'Extrême Sud" },
];

/* ── Ce que je garde ───────────────────────────────────────────────────── */

/**
 * Garder un établissement de côté.
 *
 * `saves` ne connaît que les publications. Or ce qu'on garde en préparant un
 * voyage, ce n'est pas un récit : c'est l'hôtel où on pense dormir. Sans ça,
 * un voyageur qui trouve trois adresses à Majunga doit les noter ailleurs — et
 * il ne revient pas.
 */
export async function basculerFicheGardee(pageId: string, actuel: boolean): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  if (actuel) {
    await supabase.from("page_saves").delete().eq("page_id", pageId).eq("user_id", user.id);
    return false;
  }
  const { error } = await supabase
    .from("page_saves")
    .insert({ page_id: pageId, user_id: user.id });
  if (error) throw error;
  return true;
}

export async function ficheEstGardee(pageId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("page_saves")
    .select("page_id")
    .eq("page_id", pageId)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}

export interface FicheGardee {
  id: string;
  slug: string;
  name: string;
  categories: string[];
  short_desc: string | null;
  cover_url: string | null;
  place_name: string | null;
  landmark: string | null;
  phone: string | null;
  price_min_ar: number | null;
  price_min_unit: string | null;
  rating_avg: number;
  rating_count: number;
  garde_le: string;
  note: string | null;
}

export async function mesEtablissementsGardes(): Promise<FicheGardee[]> {
  const { data, error } = await supabase.rpc("mes_etablissements_gardes", { p_limite: 50 });
  if (error) throw error;
  return (data as FicheGardee[]) ?? [];
}

export interface PublicationAimee {
  id: string;
  body: string | null;
  media: { url: string }[];
  place: string | null;
  created_at: string;
  aime_le: string;
  reactions_count: number;
  comments_count: number;
  auteur: { id: string; nom: string | null; avatar: string | null };
}

/** Les publications AIMÉES — signal distinct de l'enregistrement, et souvent
 *  le seul qu'un lecteur laisse derrière lui. */
export async function mesPublicationsAimees(): Promise<PublicationAimee[]> {
  const { data, error } = await supabase.rpc("mes_publications_aimees", { p_limite: 50 });
  if (error) throw error;
  return (data as unknown as PublicationAimee[]) ?? [];
}

/* ── Mise en forme ─────────────────────────────────────────────────────── */


/** « 85 000 Ar ». Les montants sont des entiers d'ariary, jamais de décimales. */
export function ariary(montant: number | null | undefined): string {
  if (montant === null || montant === undefined) return "—";
  return `${Math.round(montant).toLocaleString("fr-FR").replace(/ | /g, " ")} Ar`;
}

export const UNITES: Record<string, string> = {
  nuit: "la nuit",
  plat: "le plat",
  personne: "par personne",
  jour: "par jour",
  circuit: "le circuit",
  chambre: "la chambre",
  portion: "la portion",
  "2_personnes": "pour 2",
  kg: "le kilo",
  part: "la part",
  verre: "le verre",
  groupe: "le groupe",
  vehicule: "le véhicule",
  bateau: "le bateau",
};

export function unite(code: string | null | undefined): string {
  return (code && UNITES[code]) || "";
}

/**
 * LES RÉCITS PUBLIÉS SUR UN LIEU.
 *
 * 🔴 LA FICHE ANNONÇAIT « 1 récit » SANS CHEMIN POUR LE LIRE. Un compteur qui
 *    ne mène nulle part est une frustration : on apprend qu'il existe un
 *    témoignage sur Isalo, et on n'a aucun moyen d'y accéder. C'était le seul
 *    contenu VIVANT de la fiche, et il était invisible.
 *
 * ⚠ ON FILTRE SUR `visibilite`, pas seulement sur `status` : un récit que son
 *   auteur a gardé pour lui n'a rien à faire sur une page publique.
 */
export async function recitsDuLieu(
  /** Le SLUG du lieu : la fiche de destination ne porte pas son identifiant. */
  slug: string,
  limite = 6
): Promise<
  {
    id: string;
    body: string | null;
    media: { url: string }[];
    created_at: string;
    auteur: string | null;
    avatar: string | null;
    reactions_count: number;
  }[]
> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, body, media, created_at, reactions_count, author_id, " +
        "profiles!posts_author_id_fkey(display_name, avatar_url), " +
        // ⚠ `!inner` OBLIGATOIRE pour filtrer sur la table liee : sans lui,
        //   PostgREST applique `places.slug` a l'imbrication seule et garde
        //   TOUS les recits, avec `place` mis a null.
        "place:places!inner(slug)"
    )
    .eq("places.slug", slug)
    .eq("status", "published")
    .eq("visibilite", "public")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  type L = {
    id: string; body: string | null; media: unknown; created_at: string;
    reactions_count: number;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
  };
  return ((data ?? []) as unknown as L[]).map((r) => ({
    id: r.id,
    body: r.body,
    media: (r.media as { url: string }[]) ?? [],
    created_at: r.created_at,
    auteur: r.profiles?.display_name ?? null,
    avatar: r.profiles?.avatar_url ?? null,
    reactions_count: r.reactions_count,
  }));
}

/* ── Reconnaître un établissement pendant qu'on tape son nom ─────────────── */

export interface SuggestionEtab {
  slug: string;
  nom: string;
  sous_categorie: string | null;
  categories: string[] | null;
  repere: string | null;
  place_id: string | null;
  lieu_nom: string | null;
  deja_revendique: boolean;
}

/**
 * 🔴 CE QUE ÇA ÉVITE : LE DOUBLON QU'ON NE PEUT PLUS DÉFAIRE. L'annuaire porte
 *    3 254 établissements importés d'OpenStreetMap et de Wikivoyage. Un gérant
 *    qui tape le nom de son hôtel dans l'assistant a de bonnes chances qu'il y
 *    soit déjà — et créait jusqu'ici une SECONDE fiche. Les avis se posent
 *    alors sur l'une, les tarifs sur l'autre, et les deux remontent dans la
 *    recherche.
 *
 * ⚠ NE REND JAMAIS `owner_id` (migration 0106), seulement un booléen : rendre
 *   l'identifiant permettrait de dresser, en tapant des noms au hasard, la
 *   liste des membres qui tiennent un établissement.
 */
export async function chercherEtablissementsParNom(
  terme: string,
  limite = 6
): Promise<SuggestionEtab[]> {
  // ⚠ La garde est AUSSI côté serveur ; ici on évite juste l'aller-retour.
  if (terme.trim().length < 3) return [];
  const { data, error } = await supabase.rpc("chercher_etablissements_par_nom", {
    p_terme: terme,
    p_limite: limite,
  });
  if (error) throw error;
  return (data as unknown as SuggestionEtab[]) ?? [];
}
