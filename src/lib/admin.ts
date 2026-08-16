/**
 * Console d'administration — le seul point d'entrée du client vers les RPC
 * d'administration (migrations 0097 et 0098).
 *
 * ⚠ CE FICHIER NE PROTÈGE RIEN. Toutes les fonctions ci-dessous appellent des
 *   RPC `SECURITY DEFINER` qui commencent, chacune, par `if not is_admin()
 *   then raise`. Le garde est là-bas, en base ; ici il n'y a que de la mise en
 *   forme. Un `if` en React ne protège que l'affichage : la clé anonyme du
 *   projet est publique par construction, n'importe qui peut appeler ces RPC à
 *   la main. C'est pourquoi `jeSuisAdmin()` sert à choisir QUOI AFFICHER, et
 *   jamais à décider ce qui est permis.
 *
 * ⚠ LE CURSEUR EST UN COUPLE, PAS UNE DATE. L'ordre des listes est
 *   `(created_at desc, id desc)` — total, donc reproductible. Sur un tri
 *   descendant, la page suivante demande ce qui est plus PETIT que le dernier
 *   élément lu : d'où `{ date, id }` du DERNIER élément, et jamais un `offset`,
 *   qui saute ou répète une ligne dès qu'une insertion se glisse entre deux
 *   pages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/* ── Les formes que la console manipule ─────────────────────────────────── */

/** Fiche du référentiel qu'une photo peut illustrer. */
export type CibleType = "destination" | "site" | "plat" | "etablissement";

export const LIBELLE_CIBLE: Record<CibleType, string> = {
  destination: "Destination",
  site: "Site",
  plat: "Plat",
  etablissement: "Établissement",
};

/**
 * ⚠ TOUS LES COMPTEURS SONT COMPTÉS EN SQL, PAS EN JAVASCRIPT. PostgREST
 *   plafonne silencieusement une lecture à 1000 lignes : compter `data.length`
 *   afficherait « 1000 » pour toujours à partir du 1001ᵉ membre, sans une
 *   seule erreur pour le signaler.
 */
export interface StatistiquesAdmin {
  membres: number;
  membres_7j: number;
  membres_pro: number;
  publications: number;
  publications_masquees: number;
  publications_retirees: number;
  publications_7j: number;
  commentaires: number;
  signalements_ouverts: number;
  signalements_traites: number;
  photos_en_attente: number;
  photos_approuvees: number;
  destinations: number;
  destinations_photo: number;
  sites: number;
  plats: number;
  etablissements: number;
  promos_actives: number;
  /** Horodatage du serveur : l'écran dit de quand datent les chiffres. */
  arrete_le: string;
}

export interface MembreAdmin {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  account_type: string;
  verification: string;
  posts_count: number;
  followers_count: number;
  roles: string[];
  created_at: string;
}

export interface PublicationAdmin {
  id: string;
  body: string | null;
  media: unknown;
  kind: string;
  status: string;
  created_at: string;
  auteur_id: string;
  auteur_nom: string | null;
  auteur_avatar: string | null;
  nb_signalements: number;
  motifs: string[];
}

export interface PhotoProposee {
  id: string;
  cible_type: CibleType;
  cible_id: string;
  cible_nom: string | null;
  /** Route de la fiche visée (`/lieu/…`, `/site/…`, `/plat/…`, `/p/…`), calculée en base. */
  cible_lien: string | null;
  url: string;
  largeur: number | null;
  hauteur: number | null;
  legende: string | null;
  credit: string | null;
  statut: "en_attente" | "approuvee" | "refusee";
  motif_refus: string | null;
  created_at: string;
  proposeur_id: string;
  proposeur_nom: string | null;
  proposeur_avatar: string | null;
}

export interface CodePromo {
  id: string;
  code: string;
  libelle: string;
  detail: string | null;
  page_id: string | null;
  page_nom: string | null;
  avantage: string | null;
  debut: string | null;
  fin: string | null;
  actif: boolean;
  created_at: string;
}

/** Dernier élément lu d'une liste — l'ordre étant total, il suffit à reprendre. */
export interface Curseur {
  date: string;
  id: string;
}

/* ── Le client typé localement ──────────────────────────────────────────── */

/**
 * ⚠ POURQUOI CETTE DÉCLARATION LOCALE. `integrations/supabase/types.ts` est
 *   REGÉNÉRÉ depuis la base : les fonctions des migrations 0097 et 0098 n'y
 *   figureront qu'une fois ces migrations APPLIQUÉES, et `types.ts` est un
 *   fichier partagé qu'un chantier ne retouche pas à la main. On déclare donc
 *   ici, EN UN SEUL ENDROIT, la forme exacte de ce qu'on appelle — plutôt que
 *   de parsemer le code de `any`, précisément ce que l'entête de `types.ts`
 *   interdit (« chaque contournement est un bug futur ») et ce que le tsconfig
 *   de ce dépôt refuse.
 *
 * ⚠ LE JOUR OÙ LES TYPES SERONT RÉGÉNÉRÉS, ce bloc et `base` disparaissent
 *   sans qu'une seule requête change : les signatures sont identiques à celles
 *   des migrations, argument par argument.
 *
 * ⚠ `is_admin` N'EST PAS DANS CE BLOC : elle est déjà dans `types.ts` depuis le
 *   socle, et s'appelle donc sur le client normal.
 */
type SchemaAdmin = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      dk_admin_statistiques: {
        Args: Record<string, never>;
        Returns: StatistiquesAdmin;
      };
      dk_admin_membres: {
        Args: {
          p_curseur_date?: string | null;
          p_curseur_id?: string | null;
          p_limite?: number;
          p_recherche?: string | null;
        };
        Returns: MembreAdmin[];
      };
      dk_admin_publications: {
        Args: {
          p_statut?: string;
          p_curseur_date?: string | null;
          p_curseur_id?: string | null;
          p_limite?: number;
        };
        Returns: PublicationAdmin[];
      };
      dk_admin_moderer_publication: {
        Args: { p_post: string; p_action: string; p_motif?: string | null };
        Returns: string;
      };
      dk_admin_role: {
        Args: { p_membre: string; p_accorder: boolean };
        Returns: boolean;
      };
      dk_admin_promos: {
        Args: Record<string, never>;
        Returns: CodePromo[];
      };
      dk_admin_promo_enregistrer: {
        Args: {
          p_id?: string | null;
          p_code: string;
          p_libelle: string;
          p_detail?: string | null;
          p_page?: string | null;
          p_avantage?: string | null;
          p_debut?: string | null;
          p_fin?: string | null;
          p_actif?: boolean;
        };
        Returns: string;
      };
      dk_admin_promo_supprimer: {
        Args: { p_id: string };
        Returns: boolean;
      };
      dk_admin_photos: {
        Args: {
          p_statut?: string;
          p_curseur_date?: string | null;
          p_curseur_id?: string | null;
          p_limite?: number;
        };
        Returns: PhotoProposee[];
      };
      dk_admin_traiter_photo: {
        Args: { p_proposition: string; p_action: string; p_motif?: string | null };
        Returns: string;
      };
      dk_admin_poser_photo: {
        Args: {
          p_cible_type: string;
          p_cible: string;
          p_url: string;
          p_largeur?: number | null;
          p_hauteur?: number | null;
          p_credit?: string | null;
          p_legende?: string | null;
        };
        Returns: string;
      };
      dk_proposer_photo: {
        Args: {
          p_cible_type: string;
          p_cible: string;
          p_url: string;
          p_largeur?: number | null;
          p_hauteur?: number | null;
          p_legende?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

const base = supabase as unknown as SupabaseClient<SchemaAdmin>;

/* ── Le garde d'affichage ───────────────────────────────────────────────── */

/**
 * Vrai si la session en cours est celle de l'administration.
 *
 * ⚠ CE N'EST PAS LE CONTRÔLE D'ACCÈS, c'est ce qui décide d'afficher la console
 *   ou une porte fermée. Le vrai contrôle est dans `is_admin()` côté serveur,
 *   rejoué à CHAQUE RPC. Cette fonction ne fait que poser la même question à
 *   la même source de vérité pour éviter d'afficher un écran vide.
 *
 * ⚠ ELLE NE JETTE JAMAIS. `is_admin()` est exécutable par `anon` (0018, requis
 *   par des policies de lecture) : appelée sans droits, elle répond `false`,
 *   pas une erreur. Une panne réseau doit fermer la porte, pas l'ouvrir — d'où
 *   le `false` en cas d'erreur.
 */
export async function jeSuisAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

/* ── Statistiques ───────────────────────────────────────────────────────── */

export async function statistiquesAdmin(): Promise<StatistiquesAdmin> {
  const { data, error } = await base.rpc("dk_admin_statistiques");
  if (error) throw error;
  return data;
}

/* ── Membres ────────────────────────────────────────────────────────────── */

export async function membresAdmin(
  curseur: Curseur | null,
  recherche: string | null,
  limite = 40
): Promise<MembreAdmin[]> {
  const { data, error } = await base.rpc("dk_admin_membres", {
    p_curseur_date: curseur?.date ?? null,
    p_curseur_id: curseur?.id ?? null,
    p_limite: limite,
    p_recherche: recherche,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Donne ou retire le rôle de modérateur.
 *
 * 🔴 LE RÔLE `admin` NE SE DISTRIBUE PAS DEPUIS L'ÉCRAN, et la RPC n'accepte
 *    même pas le nom du rôle en argument : elle ne connaît que `moderateur`.
 *    Sinon un modérateur promu par erreur se promouvrait administrateur puis
 *    évincerait le propriétaire — une escalade en deux clics.
 */
export async function basculerModerateur(membre: string, accorder: boolean): Promise<void> {
  const { error } = await base.rpc("dk_admin_role", { p_membre: membre, p_accorder: accorder });
  if (error) throw error;
}

/* ── Publications ───────────────────────────────────────────────────────── */

export type FiltrePublications = "signalees" | "masquees" | "retirees" | "toutes";
export type ActionPublication = "autoriser" | "masquer" | "retirer";

export async function publicationsAdmin(
  statut: FiltrePublications,
  curseur: Curseur | null,
  limite = 30
): Promise<PublicationAdmin[]> {
  const { data, error } = await base.rpc("dk_admin_publications", {
    p_statut: statut,
    p_curseur_date: curseur?.date ?? null,
    p_curseur_id: curseur?.id ?? null,
    p_limite: limite,
  });
  if (error) throw error;
  return data ?? [];
}

export async function modererPublication(
  post: string,
  action: ActionPublication,
  motif?: string
): Promise<string> {
  const { data, error } = await base.rpc("dk_admin_moderer_publication", {
    p_post: post,
    p_action: action,
    p_motif: motif ?? null,
  });
  if (error) throw error;
  return data;
}

/* ── Photos proposées ───────────────────────────────────────────────────── */

export type FiltrePhotos = "en_attente" | "approuvee" | "refusee" | "toutes";

export async function photosAdmin(
  statut: FiltrePhotos,
  curseur: Curseur | null,
  limite = 30
): Promise<PhotoProposee[]> {
  const { data, error } = await base.rpc("dk_admin_photos", {
    p_statut: statut,
    p_curseur_date: curseur?.date ?? null,
    p_curseur_id: curseur?.id ?? null,
    p_limite: limite,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Approuve ou refuse une proposition.
 *
 * ⚠ UN REFUS EXIGE UN MOTIF, et la base le refuse aussi — pas seulement le
 *   formulaire. Le motif part en notification au proposeur : un refus muet se
 *   lit comme une panne, et la personne repropose la même photo.
 */
export async function traiterPhoto(
  proposition: string,
  action: "approuver" | "refuser",
  motif?: string
): Promise<string> {
  const { data, error } = await base.rpc("dk_admin_traiter_photo", {
    p_proposition: proposition,
    p_action: action,
    p_motif: motif ?? null,
  });
  if (error) throw error;
  return data;
}

/** L'administration pose une photo directement sur une fiche. */
export async function poserPhotoAdmin(args: {
  cibleType: CibleType;
  cible: string;
  url: string;
  largeur?: number | null;
  hauteur?: number | null;
  credit?: string | null;
  legende?: string | null;
}): Promise<string> {
  const { data, error } = await base.rpc("dk_admin_poser_photo", {
    p_cible_type: args.cibleType,
    p_cible: args.cible,
    p_url: args.url,
    p_largeur: args.largeur ?? null,
    p_hauteur: args.hauteur ?? null,
    p_credit: args.credit ?? null,
    p_legende: args.legende ?? null,
  });
  if (error) throw error;
  return data;
}

/**
 * Un membre propose une photo pour une fiche du référentiel.
 *
 * ⚠ EXPOSÉE ICI MAIS PAS ENCORE APPELÉE PAR UN ÉCRAN PUBLIC. Le bouton
 *   « Proposer une photo » sur les fiches est un branchement à part ; la RPC et
 *   sa file de modération existent, ce qui permet de poser le bouton sans
 *   toucher à la base. Tant qu'aucun écran ne l'appelle, la file ne se remplit
 *   que par l'administration — et l'onglet le dit au lieu de faire semblant.
 */
export async function proposerPhoto(args: {
  cibleType: CibleType;
  cible: string;
  url: string;
  largeur?: number | null;
  hauteur?: number | null;
  legende?: string | null;
}): Promise<string> {
  const { data, error } = await base.rpc("dk_proposer_photo", {
    p_cible_type: args.cibleType,
    p_cible: args.cible,
    p_url: args.url,
    p_largeur: args.largeur ?? null,
    p_hauteur: args.hauteur ?? null,
    p_legende: args.legende ?? null,
  });
  if (error) throw error;
  return data;
}

/* ── Codes promo ────────────────────────────────────────────────────────── */

export async function promosAdmin(): Promise<CodePromo[]> {
  const { data, error } = await base.rpc("dk_admin_promos");
  if (error) throw error;
  return data ?? [];
}

export async function enregistrerPromo(promo: {
  id?: string | null;
  code: string;
  libelle: string;
  detail?: string | null;
  page?: string | null;
  avantage?: string | null;
  debut?: string | null;
  fin?: string | null;
  actif?: boolean;
}): Promise<string> {
  const { data, error } = await base.rpc("dk_admin_promo_enregistrer", {
    p_id: promo.id ?? null,
    p_code: promo.code,
    p_libelle: promo.libelle,
    p_detail: promo.detail ?? null,
    p_page: promo.page ?? null,
    p_avantage: promo.avantage ?? null,
    p_debut: promo.debut ?? null,
    p_fin: promo.fin ?? null,
    p_actif: promo.actif ?? true,
  });
  if (error) throw error;
  return data;
}

export async function supprimerPromo(id: string): Promise<void> {
  const { error } = await base.rpc("dk_admin_promo_supprimer", { p_id: id });
  if (error) throw error;
}

/* ── Petits utilitaires d'affichage ─────────────────────────────────────── */

/**
 * Curseur à passer pour obtenir la page suivante, ou `null` s'il n'y en a pas.
 *
 * ⚠ « MOINS QUE LA LIMITE DEMANDÉE » EST LE SEUL SIGNAL FIABLE de fin de
 *   liste. Compter les éléments déjà chargés ne dit rien : on ne connaît pas
 *   le total, et on ne va pas le demander à chaque page.
 */
export function curseurSuivant<T extends { created_at: string; id: string }>(
  lot: T[],
  limite: number
): Curseur | null {
  if (lot.length < limite) return null;
  const dernier = lot[lot.length - 1];
  return { date: dernier.created_at, id: dernier.id };
}

/** Date courte, sans heure — « 17 août 2026 ». */
export function dateCourte(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Date avec l'heure — pour dire de quand datent des chiffres. */
export function dateEtHeure(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Nombre lisible — « 1 494 ».
 *
 * ⚠ AUCUN ARRONDI « 1,5 k ». Une console d'administration sert à trancher : un
 *   chiffre arrondi oblige à retourner le chercher ailleurs.
 */
export function nombre(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR");
}

/** Message d'erreur lisible, quelle que soit la forme de ce qui a été jeté. */
export function messageErreur(e: unknown, repli: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return repli;
}
