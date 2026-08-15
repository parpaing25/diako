import { supabase } from "@/integrations/supabase/client";

/**
 * ACCÈS AUX DONNÉES DES ÉCRANS NOUVEAUX — atlas culinaire, carnet de goûts,
 * circuits, sites et parcs, événements, projets de voyage, guides.
 *
 * Même discipline que `api.ts` et `etablissements.ts` : colonnes énumérées,
 * jamais `select('*')`, pagination par curseur, aucun canal temps réel.
 *
 * ⚠ CES TABLES SONT VIDES AUJOURD'HUI, sauf le référentiel des plats. Les
 *   fonctions rendent donc des listes vides — c'est un état normal, pas une
 *   erreur, et les écrans doivent le dire au lieu de tourner dans le vide.
 */

/* ── L'ATLAS CULINAIRE ─────────────────────────────────────────────────── */

export interface PlatAtlas {
  id: string;
  slug: string;
  name_fr: string;
  name_mg: string | null;
  family: string | null;
  /** La region vient du LIEU typique, il n'y a pas de colonne region sur
   *  le plat : `dishes.typical_place_id` -> `places.region`. */
  typical_place: { slug: string; name_fr: string; region: string | null } | null;
  photo_url: string | null;
  price_min_ar: number | null;
  price_max_ar: number | null;
  has_pork: boolean;
  has_beef: boolean;
  has_seafood: boolean;
  has_peanut: boolean;
  is_vegetarian: boolean;
  spice_level: number | null;
  /** Nombre d'adresses qui le servent. 0 partout tant qu'aucune carte n'est saisie. */
  nb_adresses?: number;
}

const COLONNES_PLAT =
  "id, slug, name_fr, name_mg, family, photo_url, price_min_ar, price_max_ar, " +
  "has_pork, has_beef, has_seafood, has_peanut, is_vegetarian, spice_level, " +
  "typical_place:places!dishes_typical_place_id_fkey(slug, name_fr, region)";

export interface FiltresAtlas {
  familles?: string[];
  /** « sans_porc », « vegetarien », « sans_arachide », « sans_fruits_de_mer ». */
  regimes?: string[];
  region?: string | null;
  q?: string | null;
  /** Curseur : le `slug` du dernier plat rendu. */
  curseur?: string | null;
  limite?: number;
}

/**
 * ⚠ PAGINATION PAR CURSEUR SUR LE SLUG, jamais par `range()`. Un offset se
 *   décale dès qu'un plat est ajouté au référentiel, et le lecteur voit deux
 *   fois le même plat ou en saute un.
 */
export async function chargerAtlas(f: FiltresAtlas = {}): Promise<PlatAtlas[]> {
  let q = supabase.from("dishes").select(COLONNES_PLAT).order("slug", { ascending: true });

  if (f.familles?.length) q = q.in("family", f.familles);
  // ⚠ Le filtre par region traverse la relation : le plat ne porte pas sa
  //   region, il porte son LIEU typique.
  if (f.region) q = q.eq("places.region", f.region);
  if (f.curseur) q = q.gt("slug", f.curseur);
  if (f.q?.trim()) q = q.ilike("name_fr", `%${f.q.trim()}%`);

  // ⚠ LES RÉGIMES SONT DÉRIVÉS DES INGRÉDIENTS, jamais d'une case cochée à la
  //   main : c'est la règle du design final. Ils se lisent donc sur les
  //   colonnes booléennes calculées à l'import du référentiel.
  for (const r of f.regimes ?? []) {
    if (r === "sans_porc") q = q.eq("has_pork", false);
    if (r === "vegetarien") q = q.eq("is_vegetarian", true);
    if (r === "sans_arachide") q = q.eq("has_peanut", false);
    if (r === "sans_fruits_de_mer") q = q.eq("has_seafood", false);
  }

  const { data, error } = await q.limit(f.limite ?? 24);
  if (error) throw error;
  return (data as unknown as PlatAtlas[]) ?? [];
}

/** Les compteurs de l'atlas, calculés — jamais écrits en dur dans l'écran. */
export async function statsAtlas(): Promise<{
  plats: number;
  variantes: number;
  familles: number;
  cartes: number;
}> {
  const [plats, variantes, cartes, familles] = await Promise.all([
    supabase.from("dishes").select("id", { count: "exact", head: true }),
    supabase.from("dish_aliases").select("id", { count: "exact", head: true }),
    supabase.from("menu_items").select("id", { count: "exact", head: true }),
    supabase.from("dishes").select("family"),
  ]);
  const distinctes = new Set(
    ((familles.data ?? []) as { family: string | null }[])
      .map((x) => x.family ?? "")
      .filter(Boolean)
  );
  return {
    plats: plats.count ?? 0,
    variantes: variantes.count ?? 0,
    familles: distinctes.size,
    cartes: cartes.count ?? 0,
  };
}

/* ── LE CARNET DE GOÛTS ────────────────────────────────────────────────── */

export interface Degustation {
  dish_id: string;
  tasted_at: string;
  note: string | null;
  plat: { slug: string; name_fr: string; family: string | null; photo_url: string | null } | null;
}

export async function monCarnet(): Promise<Degustation[]> {
  const { data, error } = await supabase
    .from("dish_tastings")
    .select("dish_id, tasted_at, note, plat:dishes(slug, name_fr, family, photo_url)")
    .order("tasted_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as Degustation[]) ?? [];
}

/**
 * Marque un plat goûté, ou retire la marque.
 *
 * ⚠ PAS DE `.single()` EN ÉCRITURE — piège déjà payé sur ce dépôt : quand la
 *   ligne existe déjà, `.single()` lève au lieu de rendre l'état courant, et
 *   l'interface annonce un échec alors que tout va bien.
 */
export async function basculerDegustation(dishId: string, postId?: string | null) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Connexion requise.");

  const { data: existe } = await supabase
    .from("dish_tastings")
    .select("id")
    .eq("user_id", uid)
    .eq("dish_id", dishId)
    .limit(1);

  if (existe?.length) {
    const { error } = await supabase.from("dish_tastings").delete().eq("id", existe[0].id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("dish_tastings")
    .insert({ user_id: uid, dish_id: dishId, post_id: postId ?? null })
    .select("id");
  if (error) throw error;
  return true;
}

/**
 * Bascule une degustation depuis un SLUG.
 *
 * ⚠ La RPC `fiche_plat` ne rend pas l'identifiant du plat, seulement son slug.
 *   Plutot que d'elargir la RPC — et de la redeployer pour une colonne — on
 *   resout ici, en une requete indexee sur une colonne unique.
 */
export async function basculerDegustationParSlug(slug: string, postId?: string | null) {
  const { data, error } = await supabase.from("dishes").select("id").eq("slug", slug).limit(1);
  if (error) throw error;
  const id = (data?.[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error("Plat introuvable.");
  return basculerDegustation(id, postId);
}

/* ── CIRCUITS ──────────────────────────────────────────────────────────── */

export interface CircuitListe {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  duration_days: number;
  duration_nights: number | null;
  difficulty: string | null;
  format: string | null;
  axe: string | null;
  months_open: number[] | null;
  page: { slug: string; name: string; verification_status: string } | null;
}

export async function chargerCircuits(limite = 24): Promise<CircuitListe[]> {
  const { data, error } = await supabase
    .from("tours")
    .select(
      "id, slug, title, summary, duration_days, duration_nights, difficulty, format, axe, months_open, " +
        "page:pages(slug, name, verification_status)"
    )
    .order("duration_days", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data as unknown as CircuitListe[]) ?? [];
}

/* ── SITES ET PARCS ────────────────────────────────────────────────────── */

export interface SiteListe {
  id: string;
  slug: string;
  name: string;
  kind: string;
  summary: string | null;
  cover_url: string | null;
  /** ⚠ Le credit voyage AVEC la photo. Les images viennent de Wikimedia
   *  Commons, sous licences variees dont la plupart exigent de nommer l'auteur
   *  ET la licence : une couverture affichee sans ces trois champs est une
   *  violation, pas un oubli de forme. */
  cover_credit: string | null;
  cover_licence: string | null;
  cover_source: string | null;
  fee_resident_ar: number | null;
  fee_nonresident_ar: number | null;
  guide_required: boolean;
  guide_fee_group_ar: number | null;
  best_months: number[];
  fady: string[];
  rates_checked_at: string | null;
  place: { slug: string; name_fr: string; region: string | null } | null;
}

const COLONNES_SITE =
  "id, slug, name, kind, summary, cover_url, fee_resident_ar, fee_nonresident_ar, " +
  "guide_required, guide_fee_group_ar, best_months, fady, rates_checked_at, " +
  "cover_credit, cover_licence, cover_source, " +
  "place:places(slug, name_fr, region)";

/** Les 12 genres de sites reellement presents en base, dans l'ordre d'interet. */
export const GENRES_SITE = [
  "reserve", "parc", "sommet", "plage", "patrimoine", "site",
  "point_de_vue", "cascade", "grotte", "musee", "parc_animalier", "oeuvre",
  // ⚠ `source` et `aire` existent en base (14 et 4 lignes). Les omettre ici
  //   les rendait invisibles au filtre — atteignables seulement en faisant
  //   defiler « Tous » sur 2 429 fiches, donc pas atteignables.
  "source", "aire",
] as const;

export interface FiltreSites {
  genre?: string;
  region?: string;
  q?: string;
  /** Curseur = le `name` du dernier site recu. */
  apres?: string | null;
  limite?: number;
}

/**
 * La liste des sites — filtrable, et qui va jusqu'au bout.
 *
 * 🔴 CE QUE CA CORRIGE. L'ecran chargeait 24 sites tries par nom croissant, sur
 *    2 474 en base : la page s'arretait aux « A », et 2 450 sites n'etaient
 *    atteignables par AUCUN chemin. Un annuaire dont on ne peut pas voir le
 *    fond n'est pas un annuaire.
 *
 * ⚠ PAGINATION PAR CURSEUR, JAMAIS PAR OFFSET. Un `range(24, 48)` decale toute
 *   la suite des qu'une ligne est ajoutee ou publiee entre deux pages :
 *   doublons et sites sautes. Le curseur est le nom du dernier recu.
 *
 * ⚠ LE TRI RESTE ALPHABETIQUE parce que c'est le seul ordre TOTAL et STABLE
 *   disponible : trier « les documentes d'abord » ferait remonter les memes
 *   180 fiches a chaque page et casserait le curseur. Le tri par interet est
 *   rendu par le FILTRE (genre), pas par l'ordre.
 */
export async function chargerSites(f: FiltreSites = {}): Promise<SiteListe[]> {
  // 🔴 `!inner` EST OBLIGATOIRE POUR FILTRER SUR LA TABLE LIEE. Sans lui,
  //    PostgREST applique `places.region` A L'IMBRICATION SEULE : la ligne est
  //    gardee, avec `place` mis a null. On aurait obtenu 24 sites « de la
  //    Diana » dont aucun n'est dans la Diana, et sans lieu affiche. Le filtre
  //    aurait eu l'air de marcher tout en ne filtrant rien.
  // ⚠ `places.region` porte le NOM COMPLET (« Haute Matsiatra »), pas un slug.
  let r = supabase
    .from("attractions")
    .select(f.region ? COLONNES_SITE.replace("place:places(", "place:places!inner(") : COLONNES_SITE)
    .eq("is_published", true);

  if (f.genre) r = r.eq("kind", f.genre);
  if (f.region) r = r.eq("places.region", f.region);
  if (f.q?.trim()) r = r.ilike("name", `%${f.q.trim()}%`);
  if (f.apres) r = r.gt("name", f.apres);

  const { data, error } = await r
    .order("name", { ascending: true })
    .limit(f.limite ?? 24);
  if (error) throw error;
  return (data as unknown as SiteListe[]) ?? [];
}

/** Combien de sites par genre — sert a n'afficher que les filtres qui rendent
 *  quelque chose, et a annoncer le volume reel de l'annuaire. */
export async function compterSites(): Promise<{ total: number; parGenre: Record<string, number> }> {
  const { data, error } = await supabase.rpc("compter_sites");
  if (error) throw error;
  const l = (data ?? []) as unknown as { kind: string; n: number }[];
  return {
    total: l.reduce((s, x) => s + Number(x.n), 0),
    parGenre: Object.fromEntries(l.map((x) => [x.kind, Number(x.n)])),
  };
}

export async function chargerSite(slug: string): Promise<SiteListe | null> {
  const { data, error } = await supabase
    .from("attractions")
    .select(COLONNES_SITE + ", description, source, manager, circuits, gear_needed, species, opening_hours, ticket_validity_days, lat, lng")
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as unknown as SiteListe) ?? null;
}

/* ── ÉVÉNEMENTS ────────────────────────────────────────────────────────── */

export interface Evenement {
  id: string;
  slug: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string | null;
  yearly: boolean;
  summary: string | null;
  poster_url: string | null;
  price_ar: number | null;
  price_unit: string | null;
  organizer: string | null;
  place: { slug: string; name_fr: string; region: string | null } | null;
}

export async function chargerEvenements(limite = 24): Promise<Evenement[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, slug, title, kind, starts_on, ends_on, yearly, summary, poster_url, price_ar, " +
        "price_unit, organizer, place:places(slug, name_fr, region)"
    )
    .eq("is_published", true)
    .order("starts_on", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data as unknown as Evenement[]) ?? [];
}

/* ── GUIDES ÉDITORIAUX ─────────────────────────────────────────────────── */

export interface Guide {
  id: string;
  slug: string;
  title: string;
  kind: string;
  summary: string | null;
  body?: string | null;
  cover_url: string | null;
  published_at: string | null;
  place: { slug: string; name_fr: string } | null;
}

export async function chargerGuides(limite = 24): Promise<Guide[]> {
  const { data, error } = await supabase
    .from("guides")
    .select("id, slug, title, kind, summary, cover_url, published_at, place:places(slug, name_fr)")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data as unknown as Guide[]) ?? [];
}

export async function chargerGuide(slug: string): Promise<Guide | null> {
  const { data, error } = await supabase
    .from("guides")
    .select("id, slug, title, kind, summary, body, cover_url, published_at, place:places(slug, name_fr)")
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as unknown as Guide) ?? null;
}

/* ── PROJET DE VOYAGE ──────────────────────────────────────────────────── */

export interface Projet {
  id: string;
  envies: string[];
  date_from: string | null;
  date_to: string | null;
  date_flex_days: number | null;
  adults: number;
  children_ages: number[];
  budget_ar: number | null;
  notes: string | null;
  status: string;
  created_at: string;
}

/** ⚠ UN SEUL PROJET OUVERT PAR MEMBRE — garanti par un index unique partiel. */
export async function monProjet(): Promise<Projet | null> {
  const { data, error } = await supabase
    .from("trip_requests")
    .select(
      "id, envies, date_from, date_to, date_flex_days, adults, children_ages, budget_ar, notes, status, created_at"
    )
    .eq("status", "ouvert")
    .limit(1);
  if (error) throw error;
  return (data?.[0] as unknown as Projet) ?? null;
}

export async function creerProjet(p: {
  envies: string[];
  date_from?: string | null;
  date_to?: string | null;
  date_flex_days?: number | null;
  adults: number;
  children_ages?: number[];
  budget_ar?: number | null;
  notes?: string | null;
}): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Connexion requise.");

  const { data, error } = await supabase
    .from("trip_requests")
    .insert({
      user_id: uid,
      envies: p.envies,
      date_from: p.date_from ?? null,
      date_to: p.date_to ?? null,
      date_flex_days: p.date_flex_days ?? null,
      adults: p.adults,
      children_ages: p.children_ages ?? [],
      budget_ar: p.budget_ar ?? null,
      notes: p.notes ?? null,
    })
    .select("id");
  if (error) {
    // L'index unique parle clair, mais son message ne l'est pas.
    if (error.code === "23505")
      throw new Error("Vous avez déjà un projet ouvert. Clôturez-le avant d'en créer un autre.");
    throw error;
  }
  return (data?.[0] as { id: string }).id;
}

export interface Offre {
  id: string;
  title: string;
  body: string | null;
  price_ar: number | null;
  price_unit: string;
  pax: number | null;
  includes: string[];
  excludes: string[];
  valid_until: string | null;
  status: string;
  created_at: string;
  page: { slug: string; name: string; verification_status: string } | null;
}

export async function offresDuProjet(requestId: string): Promise<Offre[]> {
  const { data, error } = await supabase
    .from("trip_offers")
    .select(
      "id, title, body, price_ar, price_unit, pax, includes, excludes, valid_until, status, created_at, " +
        "page:pages(slug, name, verification_status)"
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as Offre[]) ?? [];
}

/* ── DEMANDES REÇUES (côté pro) ────────────────────────────────────────── */

export interface Demande {
  id: string;
  kind: string;
  date_from: string | null;
  date_to: string | null;
  adults: number;
  children_ages: number[];
  message: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  first_reply_at: string | null;
  created_at: string;
}

export async function demandesDeLaPage(pageId: string): Promise<Demande[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, kind, date_from, date_to, adults, children_ages, message, contact_name, " +
        "contact_phone, status, first_reply_at, created_at"
    )
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as Demande[]) ?? [];
}
