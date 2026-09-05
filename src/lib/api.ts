import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
/* ⚠ IMPORT DE TYPE SEUL. `themesFil` charge `etablissements` et `decouverte`,
 *  qui reviendraient ici : un import de valeur créerait un cycle. `import type`
 *  est effacé à la compilation, donc aucun cycle à l'exécution. */
import type { CleTheme } from "@/lib/themesFil";

/**
 * Couche d'accès aux données — LE seul endroit qui parle à la base.
 *
 * Règles du projet appliquées ici :
 *  · jamais de select('*') — les colonnes sont énumérées ;
 *  · jamais de .single() en écriture (« Cannot coerce the result to a single
 *    JSON object ») : on utilise .select('id').maybeSingle() ;
 *  · pagination par CURSEUR, jamais par offset ;
 *  · profiles se filtre par `id`, jamais par un `user_id` (il n'existe pas).
 */

/* ── Types du fil ──────────────────────────────────────────────────────── */

export interface Media {
  url: string;
  w?: number;
  h?: number;
  /** ⭐ Depuis le 03/09/2026 une publication peut porter UNE vidéo (mp4/webm),
   *  hébergée chez o2switch comme les photos. Absent = image. */
  type?: "image" | "video";
  /** L'image d'attente d'une vidéo (première image, fabriquée à l'envoi). */
  poster?: string;
}

export interface AuteurPost {
  id: string;
  name: string | null;
  avatar: string | null;
  verification: string;
  account_type: string;
}

export interface Post {
  id: string;
  kind: string;
  body: string | null;
  media: Media[];
  place: string | null;
  /* ⭐ LE SLUG DU LIEU — c'est lui qui rend la puce du fil VRAIMENT cliquable.
   *  Le commentaire d'origine disait ici « pas de slug, et c'est assume pour
   *  l'instant » : les puces retombaient sur `/recherche?q=<nom>`, une
   *  recherche plein texte qui redemandait au serveur de retrouver par son nom
   *  un lieu que la publication designait deja par son `place_id`. Un
   *  aller-retour et un ecran d'ecart a chaque clic.
   *
   *  La cause n'etait pas la jointure mais la SOURCE : le fil ne vient pas d'un
   *  `select` client, il vient de `get_feed` et `feed_filtre`, qui ne rendaient
   *  pas le slug. Migration 0102 le leur fait rendre.
   *
   *  ⚠ NULL RESTE POSSIBLE : une publication dont le lieu a ete fusionne ou
   *    supprime garde son texte sans ligne en base. L'ecran retombe alors sur
   *    la recherche, comme avant — jamais sur un lien mort. */
  place_slug: string | null;
  dish: string | null;
  page_name: string | null;
  created_at: string;
  reactions_count: number;
  comments_count: number;
  saves_count: number;
  author: AuteurPost;
  ma_reaction: string | null;
  enregistre: boolean;
  /**
   * ⭐ L'IDENTIFIANT DU LIEU — il était sélectionné puis JETÉ. C'est lui qui
   *   permet « Autres récits à <lieu> » : sans lui, la page d'un récit est un
   *   cul-de-sac, alors que c'est l'écran où atterrissent les liens partagés.
   */
  place_id?: string | null;
  /**
   * ⭐ LE PRIX RELEVÉ, avec sa date. Les trois colonnes existent et le bot les
   *   écrit ; aucune lecture ne les ramenait, donc un prix n'était visible
   *   nulle part. `price_on` dit QUAND : un tarif sans date ne vaut rien.
   *
   * ⚠ FACULTATIFS, ET CE N'EST PAS UN DÉTAIL. Seul `chargerPost` les ramène ;
   *   le fil passe par `get_feed`/`feed_filtre`, qui ne les rendent pas.
   *   `undefined` veut donc dire « pas chargé », jamais « pas de prix » — un
   *   écran qui les confondrait afficherait « prix inconnu » sur un récit qui
   *   en porte un.
   */
  price_ar?: number | null;
  price_unit?: string | null;
  price_on?: string | null;
}

/* ── Le fil ────────────────────────────────────────────────────────────── */

/** Une page du fil. `curseur` = created_at du dernier post reçu. */
/** ⚠ 8 sur telephone, 12 sur grand ecran (regle W5 de la maquette). Sur 3G,
 *  8 posts font deja ~200 Ko d'images ; sur une connexion de bureau, s'arreter
 *  a 8 fait pagayer l'utilisateur pour rien. */
export const PAR_PALIER = () =>
  typeof window !== "undefined" && window.innerWidth >= 1024 ? 12 : 8;

/** Les quatre entrées du fil de la maquette D1… */
export type ModeClassique = "tout" | "abonnements" | "pres_de_moi" | "assiettes";

/** …et les six thèmes ouverts par la migration 0115 (`src/lib/themesFil.ts`). */
export type ModeFil = ModeClassique | CleTheme;

export interface PostSitue extends Post {
  /** Renseignée seulement en mode « près de moi » : c'est le CURSEUR. */
  distance_km?: number | null;
}

/**
 * Le fil, filtré.
 *
 * ⚠ LE CURSEUR CHANGE DE NATURE SELON LE MODE. « Près de moi » trie par
 *   distance : reprendre à une date y saute des récits et en répète d'autres.
 *   D'où `apresKm`, qui n'a de sens que dans ce mode — et `curseur`, qui n'en a
 *   pas dans ce mode.
 */
export async function chargerFilFiltre(opts: {
  mode: ModeFil;
  curseur?: string | null;
  apresKm?: number | null;
  lat?: number | null;
  lng?: number | null;
  limite?: number;
}): Promise<PostSitue[]> {
  const { data, error } = await supabase.rpc("feed_filtre", {
    p_mode: opts.mode,
    p_curseur: opts.curseur ?? undefined,
    p_limite: opts.limite ?? PAR_PALIER(),
    p_lat: opts.lat ?? undefined,
    p_lng: opts.lng ?? undefined,
    p_apres_km: opts.apresKm ?? undefined,
  });
  if (error) throw error;
  return (data as unknown as PostSitue[]) ?? [];
}

/** ⚠ Ce que l'écran a le DROIT de proposer : un onglet qui ouvre sur du vide se
 *  lit comme une panne, pas comme une absence de contenu. */
export async function modesFilDisponibles(): Promise<{
  abonnements: boolean;
  assiettes: boolean;
}> {
  const { data, error } = await supabase.rpc("fil_modes_disponibles");
  if (error) throw error;
  return (data as unknown as { abonnements: boolean; assiettes: boolean }) ?? {
    abonnements: false,
    assiettes: false,
  };
}

/* ── Les six onglets thématiques (migration 0115) ──────────────────────── */

export interface CompteTheme {
  /** Fiches du référentiel : hôtels, plats, destinations… */
  fiches: number;
  /** Publications rattachées au thème par un lien RÉEL, jamais par le texte. */
  recits: number;
}

export type ComptesThemes = Record<CleTheme, CompteTheme>;

/**
 * Combien il y a derrière chaque onglet — et le VERROU qui les autorise.
 *
 * 🔴 CET APPEL N'EST PAS DÉCORATIF, IL PROTÈGE D'UN MENSONGE. Tant que la
 *    migration 0115 n'est pas passée, `feed_filtre` ignore les modes `th_*` et
 *    se termine par `else true` : demander « th_hotels » lui fait servir le fil
 *    ENTIER — 417 publications — sous l'étiquette « Hôtels ». Rien ne planterait,
 *    rien ne serait vide, et l'écran afficherait des récits de Tuléar comme des
 *    récits d'hôtel.
 *
 *    D'où la règle : les onglets thématiques n'apparaissent QUE si cette
 *    fonction répond. Elle n'existe que dans 0115, donc son existence prouve
 *    que le fil sait filtrer. `null` = on n'affiche pas les thèmes, et le fil
 *    reste exactement ce qu'il était.
 *
 * ⚠ MÉMORISÉ AU NIVEAU DU MODULE, comme `useStats` : `Feed` se remonte à chaque
 *   changement d'onglet, et sans cache l'appel repartait à chaque clic.
 */
let comptesEnVol: Promise<ComptesThemes | null> | null = null;

export function comptesThemes(): Promise<ComptesThemes | null> {
  if (comptesEnVol) return comptesEnVol;
  // ⚠ `Promise.resolve` : le constructeur de requête supabase-js est un simple
  //   *thenable*, il n'expose pas `.catch` et ne se met pas en cache tel quel.
  const p: Promise<ComptesThemes | null> = Promise.resolve(
    supabase.rpc("fil_themes_comptes")
  )
    .then(({ data, error }) => {
      if (error) throw error;
      return (data as unknown as ComptesThemes | null) ?? null;
    })
    .catch(() => {
      // ⚠ On oublie l'échec : garder une promesse rejetée condamnerait les
      //   onglets pour toute la session après un simple hoquet réseau.
      comptesEnVol = null;
      return null;
    });
  comptesEnVol = p;
  return p;
}

export async function chargerFeed(curseur?: string | null, limite = PAR_PALIER()): Promise<Post[]> {
  const { data, error } = await supabase.rpc("get_feed", {
    p_curseur: curseur ?? undefined,
    p_limite: limite,
  });
  if (error) throw error;
  return (data as unknown as Post[]) ?? [];
}

/**
 * Une publication seule, par son identifiant.
 *
 * Indispensable au partage et aux notifications : le bouton « Partager »
 * produisait `/?post=<id>` et les notifications pointaient au même endroit,
 * mais PERSONNE ne lisait ce paramètre. Le destinataire d'un lien tombait
 * sur l'accueil, et cliquer sur « Untel a aimé votre récit » ne montrait pas
 * le récit. Il existe désormais une vraie route `/post/:id`.
 *
 * `null` = introuvable ou non publiée : l'appelant affiche une 404.
 */
export async function chargerPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, kind, body, media, place, place_id, dish, page_name, created_at, author_id, reactions_count, comments_count, saves_count, status, price_ar, price_unit, price_on"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "published") return null;

  /* ⚠ EN PARALLÈLE, PAS EN SÉRIE. Auteur, slug du lieu et session partaient
   *  l'un après l'autre : trois allers-retours avant le moindre pixel, sur
   *  l'écran où l'on arrive par un lien reçu — sur une connexion malgache,
   *  c'est le triple du temps d'attente pour rien.
   *  ⚠ Le lieu ne se lit que s'il existe : une lecture de plus coûte moins
   *  qu'une puce morte, et elle ne part pas quand la publication n'a pas de
   *  lieu. */
  const [{ data: profil }, lieuSlug, { data: { user } }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, verification, account_type")
      .eq("id", data.author_id)
      .maybeSingle(),
    data.place_id
      ? supabase
          .from("places")
          .select("slug")
          .eq("id", data.place_id)
          .maybeSingle()
          .then(({ data: lieu }) => lieu?.slug ?? null)
      : Promise.resolve<string | null>(null),
    supabase.auth.getUser(),
  ]);

  let ma_reaction: string | null = null;
  let enregistre = false;
  if (user) {
    const [r, s] = await Promise.all([
      supabase.from("reactions").select("type").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
      supabase.from("saves").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
    ]);
    ma_reaction = r.data?.type ?? null;
    enregistre = !!s.data;
  }

  return {
    id: data.id,
    kind: data.kind,
    body: data.body,
    media: (data.media as unknown as Media[]) ?? [],
    place: data.place,
    place_slug: lieuSlug,
    dish: data.dish,
    page_name: data.page_name,
    created_at: data.created_at,
    reactions_count: data.reactions_count,
    comments_count: data.comments_count,
    saves_count: data.saves_count,
    author: {
      id: data.author_id,
      name: profil?.display_name ?? null,
      avatar: profil?.avatar_url ?? null,
      verification: profil?.verification ?? "none",
      account_type: profil?.account_type ?? "voyageur",
    },
    ma_reaction,
    enregistre,
    place_id: data.place_id ?? null,
    price_ar: data.price_ar ?? null,
    price_unit: data.price_unit ?? null,
    price_on: data.price_on ?? null,
  };
}

/* ── Publier ───────────────────────────────────────────────────────────── */

export async function publier(entree: {
  kind: string;
  body: string;
  media?: Media[];
  /** Le libellé saisi, conservé tel quel pour l'affichage. */
  place?: string | null;
  dish?: string | null;
  /** Les rattachements au référentiel : c'est sur EUX que la recherche porte. */
  place_id?: string | null;
  dish_id?: string | null;
  /** ⚠ Le prix d'une publication va toujours par TROIS : montant, unité, date
   *  du releve. Un montant seul ne veut rien dire (50 000 Ar la nuit ou par
   *  groupe ?) et sans date il se lit comme un prix d'aujourd'hui. La base
   *  refuse d'ailleurs un montant sans unite. */
  price_ar?: number | null;
  price_unit?: string | null;
  price_on?: string | null;
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  // ⚠ .select('id') et non .single() : le second lève « Cannot coerce the
  // result to a single JSON object » dès que la ligne n'est pas renvoyée.
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      kind: entree.kind,
      body: entree.body.trim() || null,
      media: (entree.media ?? []) as unknown as Json,
      place: entree.place || null,
      place_id: entree.place_id || null,
      dish: entree.dish || null,
      dish_id: entree.dish_id || null,
      price_ar: entree.price_ar ?? null,
      price_unit: entree.price_ar != null ? entree.price_unit || null : null,
      price_on: entree.price_ar != null ? entree.price_on || null : null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("La publication n'a pas pu être enregistrée.");
  return data.id;
}

export async function supprimerPost(id: string) {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

/* ── Réactions ─────────────────────────────────────────────────────────── */

/** Bascule la réaction. Renvoie le type courant, ou null si retirée. */
/**
 * ⚠ LE DEFAUT EST « utile », PLUS « jaime ». Le code `jaime` n'est plus
 *   autorise par la contrainte de la table depuis la migration 0031 : le
 *   design final remplace le coeur muet par six reactions nommees.
 */
export async function basculerReaction(postId: string, type = "utile"): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  const { data: existante } = await supabase
    .from("reactions")
    .select("id,type")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existante) {
    if (existante.type === type) {
      await supabase.from("reactions").delete().eq("id", existante.id);
      return null;
    }
    await supabase.from("reactions").update({ type }).eq("id", existante.id);
    return type;
  }

  const { error } = await supabase
    .from("reactions")
    .insert({ post_id: postId, user_id: user.id, type });
  if (error) throw error;
  return type;
}

/* ── Favoris ───────────────────────────────────────────────────────────── */

export async function basculerFavori(postId: string, actuel: boolean): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  if (actuel) {
    await supabase.from("saves").delete().eq("post_id", postId).eq("user_id", user.id);
    return false;
  }
  const { error } = await supabase.from("saves").insert({ post_id: postId, user_id: user.id });
  if (error) throw error;
  return true;
}

export async function mesFavoris(): Promise<Post[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: ids } = await supabase
    .from("saves")
    .select("post_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!ids?.length) return [];
  const liste = ids.map((r) => r.post_id);

  const { data } = await supabase
    .from("posts")
    .select(
      "id,kind,body,media,place,dish,page_name,created_at,reactions_count,comments_count,saves_count,author_id,places!posts_place_id_fkey(slug),profiles!posts_author_id_fkey(id,display_name,avatar_url,verification,account_type)"
    )
    .in("id", liste)
    .eq("status", "published");

  type Ligne = {
    id: string; kind: string; body: string | null; media: unknown;
    place: string | null; dish: string | null; page_name: string | null;
    created_at: string; reactions_count: number; comments_count: number;
    saves_count: number; author_id: string;
    /* ⚠ Une jointure PostgREST rend un OBJET quand la relation est « plusieurs
     *  vers un », mais supabase-js la type parfois en tableau : on accepte les
     *  deux plutot que de forcer un cast qui masquerait un vrai changement. */
    places: { slug: string } | { slug: string }[] | null;
    profiles: { id: string; display_name: string | null; avatar_url: string | null; verification: string; account_type: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    media: (r.media as Media[]) ?? [],
    place: r.place,
    place_slug: Array.isArray(r.places) ? (r.places[0]?.slug ?? null) : (r.places?.slug ?? null),
    dish: r.dish,
    page_name: r.page_name,
    created_at: r.created_at,
    reactions_count: r.reactions_count,
    comments_count: r.comments_count,
    saves_count: r.saves_count,
    author: {
      id: r.profiles?.id ?? r.author_id,
      name: r.profiles?.display_name ?? null,
      avatar: r.profiles?.avatar_url ?? null,
      verification: r.profiles?.verification ?? "none",
      account_type: r.profiles?.account_type ?? "voyageur",
    },
    ma_reaction: null,
    enregistre: true,
  }));
}

/* ── Commentaires ──────────────────────────────────────────────────────── */

export interface Commentaire {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  auteur: { name: string | null; avatar: string | null };
}

export async function chargerCommentaires(postId: string): Promise<Commentaire[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id,body,created_at,author_id,profiles!comments_author_id_fkey(display_name,avatar_url)")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  type Ligne = {
    id: string; body: string; created_at: string; author_id: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
  };
  return ((data ?? []) as unknown as Ligne[]).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author_id: c.author_id,
    auteur: { name: c.profiles?.display_name ?? null, avatar: c.profiles?.avatar_url ?? null },
  }));
}

export async function commenter(postId: string, body: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");
  const { error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: user.id, body: body.trim() });
  if (error) throw error;
}

/* ── Abonnements ───────────────────────────────────────────────────────── */

export async function basculerAbonnement(cible: string, actuel: boolean): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");
  if (user.id === cible) throw new Error("Vous ne pouvez pas vous suivre vous-même.");

  if (actuel) {
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("target_id", cible);
    return false;
  }
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, target_id: cible });
  if (error) throw error;
  return true;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

export async function chargerNotifications(limite = 30) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,type,title,message,data,read,created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

export async function compterNonLues(): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  return count ?? 0;
}

export async function toutMarquerLu() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
}

/* ── Messagerie ────────────────────────────────────────────────────────── */

export interface Conversation {
  id: string;
  last_at: string;
  autre: { id: string; name: string | null; avatar: string | null };
  dernier: string | null;
}

export async function mesConversations(): Promise<Conversation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: convs } = await supabase
    .from("conversations")
    .select("id,a_id,b_id,last_at")
    .order("last_at", { ascending: false })
    .limit(30);
  if (!convs?.length) return [];

  const autres = convs.map((c) => (c.a_id === user.id ? c.b_id : c.a_id));

  // Une seule requête pour tous les profils, et une seule pour tous les
  // derniers messages : sinon c'est un N+1 (le piège corrigé sur Fonenako).
  const [{ data: profils }, { data: derniers }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,avatar_url").in("id", autres),
    supabase
      .from("messages")
      .select("conv_id,body,created_at")
      .in("conv_id", convs.map((c) => c.id))
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const parId = new Map((profils ?? []).map((p) => [p.id, p]));
  const dernierParConv = new Map<string, string>();
  for (const m of derniers ?? []) {
    if (!dernierParConv.has(m.conv_id)) dernierParConv.set(m.conv_id, m.body);
  }

  return convs.map((c) => {
    const autreId = c.a_id === user.id ? c.b_id : c.a_id;
    const p = parId.get(autreId);
    return {
      id: c.id,
      last_at: c.last_at,
      autre: { id: autreId, name: p?.display_name ?? null, avatar: p?.avatar_url ?? null },
      dernier: dernierParConv.get(c.id) ?? null,
    };
  });
}

export async function ouvrirConversation(autre: string): Promise<string> {
  const { data, error } = await supabase.rpc("ouvrir_conversation", { p_autre: autre });
  if (error) throw error;
  return data as string;
}

export async function chargerMessages(convId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id,conv_id,sender_id,body,read,created_at")
    .eq("conv_id", convId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function envoyerMessage(convId: string, body: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");
  const { error } = await supabase
    .from("messages")
    .insert({ conv_id: convId, sender_id: user.id, body: body.trim() });
  if (error) throw error;
}

/* ── Modération ────────────────────────────────────────────────────────── */

export async function signaler(
  /** ⚠ `page` et `attraction` ouverts par la migration 0044 : c'est le
   *  seul moyen qu'un visiteur corrige une fiche importee d'OpenStreetMap,
   *  dont le releve peut dater de plusieurs annees. */
  cible: "post" | "comment" | "profile" | "message" | "page" | "attraction",
  id: string,
  raison: string
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");
  const { error } = await supabase
    .from("reports")
    .insert({ target_type: cible, target_id: id, reporter_id: user.id, reason: raison });
  if (error && error.code !== "23505") throw error; // 23505 = déjà signalé
}

/* ── Profil, historique et visibilité ──────────────────────────────────── */

export interface PublicationMienne {
  id: string;
  kind: string;
  body: string | null;
  media: Media[];
  place: string | null;
  dish: string | null;
  created_at: string;
  status: string;
  visibilite: "public" | "prive";
  reactions_count: number;
  comments_count: number;
  saves_count: number;
  price_ar: number | null;
  price_unit: string | null;
  price_on: string | null;
}

/**
 * MON historique — tout, y compris ce que j'ai gardé pour moi.
 *
 * ⚠ DEUX FONCTIONS SÉPARÉES, ET PAS UN DRAPEAU. `publications_publiques()` sert
 *   le profil public ; celle-ci sert son propriétaire. Une fonction unique avec
 *   un « je suis le propriétaire » finit toujours par fuiter au premier appelant
 *   qui l'oublie.
 */
export async function mesPublications(opts: {
  curseur?: string | null;
  limite?: number;
  kind?: string | null;
} = {}): Promise<PublicationMienne[]> {
  const { data, error } = await supabase.rpc("mes_publications", {
    p_curseur: opts.curseur ?? undefined,
    p_limite: opts.limite ?? 12,
    p_kind: opts.kind ?? undefined,
  });
  if (error) throw error;
  return (data as unknown as PublicationMienne[]) ?? [];
}

export interface MonActivite {
  publications: number;
  privees: number;
  bons_plans: number;
  assiettes: number;
  lieux: number;
  plats_goutes: number;
  carnet: number;
  mes_pages: number;
}

export async function monActivite(): Promise<MonActivite> {
  const { data, error } = await supabase.rpc("mon_activite");
  if (error) throw error;
  return data as unknown as MonActivite;
}

/**
 * Rendre une publication publique ou privée.
 *
 * ⚠ `visibilite` N'EST PAS `status`. `status` est la modération — `hidden` est
 *   subi, posé par le déclencheur au 3ᵉ signalement. `visibilite` est la
 *   décision de l'auteur. Les confondre ferait republier, le jour où la
 *   modération lève un masquage, un texte que son auteur voulait privé.
 */
export async function changerVisibilite(id: string, prive: boolean) {
  const { error } = await supabase
    .from("posts")
    .update({ visibilite: prive ? "prive" : "public" })
    .eq("id", id)
    .select("id");
  if (error) throw error;
}

export interface ProfilPublic {
  id: string;
  nom: string | null;
  avatar: string | null;
  couverture: string | null;
  bio: string | null;
  ville: string | null;
  type: string;
  metier: string | null;
  verification: string;
  membre_depuis: string;
  nb_abonnes: number;
  nb_abonnements: number;
  nb_publications: number;
  pages: { slug: string; nom: string; categories: string[]; photo: string | null; lieu: string | null }[];
  /** `null` quand la personne n'a pas ouvert ses lieux — pas quand elle n'a pas voyagé. */
  lieux: string[] | null;
}

export async function profilPublic(id: string): Promise<ProfilPublic | null> {
  const { data, error } = await supabase.rpc("profil_public", { p_id: id });
  if (error) throw error;
  return (data as unknown as ProfilPublic) ?? null;
}

export async function publicationsPubliques(
  id: string,
  curseur?: string | null,
  limite = 12
): Promise<PublicationMienne[]> {
  const { data, error } = await supabase.rpc("publications_publiques", {
    p_id: id,
    p_curseur: curseur ?? undefined,
    p_limite: limite,
  });
  if (error) throw error;
  return (data as unknown as PublicationMienne[]) ?? [];
}

/** ⚠ Faux par défaut : un historique de déplacements ne peut pas être
 *  opt-out rétroactif. C'est à la personne de l'ouvrir. */
export async function ouvrirMesLieux(ouvert: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");
  const { error } = await supabase
    .from("profiles")
    .update({ lieux_publics: ouvert })
    .eq("id", user.id)
    .select("id");
  if (error) throw error;
}
