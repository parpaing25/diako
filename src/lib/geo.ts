import { supabase } from "@/integrations/supabase/client";

/**
 * « AUTOUR DE MOI » — la question que se pose un voyageur, sur place.
 *
 * ⚠ EN QUOI C'EST DIFFÉRENT DU PROJET FRÈRE. Fonenako rattache la position GPS
 *   à la ville la plus proche, en JavaScript, contre un fichier de 23 villes
 *   codées en dur — et Ampefy n'y figure même pas. C'est assez pour orienter un
 *   fil d'annonces immobilières : on cherche un logement dans SA ville, on ne
 *   déménage pas selon les mètres.
 *
 *   En voyage, la question est littéralement géographique : on est sur une
 *   plage, il est midi, on veut ce qui est à moins de dix kilomètres. Diako a
 *   de vraies coordonnées en base — sur les lieux ET sur les établissements —
 *   donc le calcul se fait côté serveur, sur les 508 lieux réels, et rend une
 *   DISTANCE et pas une approximation de ville.
 *
 * La position n'est jamais envoyée à un service tiers : elle part vers notre
 * propre base, le temps d'une requête, et n'y est pas conservée.
 */

const CLE = "diako_geo";
/** Une position de plus d'une heure n'a plus de sens : on a bougé. */
const PEREMPTION_MS = 60 * 60 * 1000;

export interface Position {
  lat: number;
  lng: number;
  quand: number;
}

export interface LieuProche {
  id: string;
  slug: string;
  nom: string;
  region: string | null;
  distance_km: number;
  nb_etablissements: number;
  nb_recits: number;
  resume: string | null;
}

export interface EtablissementProche {
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
  completeness: number;
  distance_km: number | null;
}

export function positionEnMemoire(): Position | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const p = JSON.parse(brut) as Position;
    return Date.now() - p.quand < PEREMPTION_MS ? p : null;
  } catch {
    return null;
  }
}

/**
 * Demande la position au navigateur. Le refus est un résultat NORMAL, pas une
 * erreur : on ne relance pas, on ne culpabilise pas, le site marche sans.
 */
export function demanderPosition(): Promise<Position | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);

    const memoire = positionEnMemoire();
    if (memoire) return resolve(memoire);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          quand: Date.now(),
        };
        try {
          localStorage.setItem(CLE, JSON.stringify(p));
        } catch {
          /* mode privé : on garde la position en mémoire pour cette session */
        }
        resolve(p);
      },
      () => resolve(null),
      // Précision grossière : à 25 km près, dix mètres ne changent rien, et
      // enableHighAccuracy vide la batterie et prend plusieurs secondes.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

export function oublierPosition(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire */
  }
}

/** « Vous êtes vers Ampefy » — la destination la plus proche. */
export async function lieuLePlusProche(p: Position): Promise<LieuProche | null> {
  const { data, error } = await supabase.rpc("lieu_le_plus_proche", {
    p_lat: p.lat,
    p_lng: p.lng,
  });
  if (error) throw error;
  return (data as unknown as LieuProche | null) ?? null;
}

/** Les établissements dans un rayon donné, du plus proche au plus loin. */
export async function autourDeMoi(
  p: Position,
  options: { rayonKm?: number; categorie?: string | null; limite?: number } = {}
): Promise<EtablissementProche[]> {
  const { data, error } = await supabase.rpc("autour_de_moi", {
    p_lat: p.lat,
    p_lng: p.lng,
    p_rayon_km: options.rayonKm ?? 25,
    p_categorie: options.categorie ?? null,
    p_limite: options.limite ?? 20,
  });
  if (error) throw error;
  return (data as EtablissementProche[]) ?? [];
}

/** « 1,2 km » · « 850 m » · « 34 km ». Sous le kilomètre, les mètres parlent mieux. */
export function distanceLisible(km: number | null | undefined): string {
  if (km === null || km === undefined) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}
