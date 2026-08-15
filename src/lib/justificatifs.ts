import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompression";

/**
 * LES PIÈCES DE REVENDICATION — ET POURQUOI ELLES NE PASSENT PAS PAR O2SWITCH.
 *
 * 🔴 CE PROJET A DÉJÀ EXPOSÉ DES CARTES D'IDENTITÉ. Le 31/07/2026,
 *    `diako.fonenako.mg/backend/uploads/` listait publiquement des scans de CIN.
 *    Le dossier a été supprimé du serveur. On redemande aujourd'hui des pièces :
 *    c'est exactement le moment où l'on peut refaire la même erreur.
 *
 * ⚠ `uploadToO2Switch` EST INTERDIT ICI, ET IL FAUT SAVOIR POURQUOI. Cet
 *   endpoint écrit dans `public/uploads/`, servi par le web en 0644, ET fabrique
 *   une vignette WebP publique à côté. Une pièce d'identité y serait lisible par
 *   quiconque devine l'URL — et indexable.
 *
 *   CLAUDE.md l'écrit noir sur blanc : « Aucun document d'identité dans un
 *   dossier servi par le web. Bucket privé + URL signées courtes. » C'est la
 *   seule exception à la règle « aucune image dans Supabase Storage », et elle
 *   existe précisément pour ce cas.
 *
 * ⚠ LE CHEMIN COMMENCE PAR L'IDENTIFIANT DU COMPTE. C'est ce préfixe que la
 *   policy compare à `auth.uid()` : sans lui, un chemin deviné donnerait accès
 *   à la pièce d'identité de quelqu'un d'autre.
 */

const BUCKET = "justificatifs";

/** Ce qu'on accepte, et rien d'autre. */
const TYPES_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const TAILLE_MAX = 6 * 1024 * 1024;

export async function televerserPiece(
  fichier: File,
  quoi: "piece" | "photo_lieu"
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  if (!TYPES_OK.includes(fichier.type)) {
    throw new Error("Formats acceptés : photo (JPG, PNG) ou PDF.");
  }

  // ⚠ ON NE COMPRESSE PAS UN PDF, et on compresse les photos AVANT d'envoyer :
  //   sur une 3G malgache, six méga-octets sont plusieurs minutes.
  //   ⚠ Mais on compresse MOINS FORT qu'une photo de fil : un numéro de STAT
  //     à dix-sept chiffres devient illisible à 0,6 Mo / 1600 px, et un
  //     administrateur qui ne peut pas lire la pièce refuse le dossier.
  const charge =
    fichier.type === "application/pdf"
      ? fichier
      : await compressImage(fichier, { maxSizeMB: 2, maxWidthOrHeight: 2400 });

  if (charge.size > TAILLE_MAX) {
    throw new Error("Fichier trop lourd (6 Mo maximum).");
  }

  const ext =
    fichier.type === "application/pdf"
      ? "pdf"
      : fichier.type === "image/png"
        ? "png"
        : fichier.type === "image/webp"
          ? "webp"
          : "jpg";

  // ⚠ Un nom imprévisible : le bucket est privé, mais un nom devinable reste
  //   une mauvaise habitude — et les URL signées circulent par messagerie.
  const alea = crypto.randomUUID();
  const chemin = `${user.id}/${quoi}-${alea}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(chemin, charge, { contentType: fichier.type, upsert: false });
  if (error) throw error;

  return chemin;
}

/**
 * Une URL de consultation, VALABLE UNE HEURE.
 *
 * ⚠ On ne stocke JAMAIS cette URL : elle expire, et une URL signée conservée
 *   en base est une URL publique à retardement.
 */
export async function urlSigneePiece(chemin: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(chemin, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/* ── La forme des identifiants fiscaux malgaches ─────────────────────────── */

/**
 * ⚠ ON VÉRIFIE LA FORME, PAS L'EXISTENCE — et la nuance est capitale.
 *
 *   Un NIF bien formé n'est pas un NIF valide, et sa présence ne prouve
 *   RIEN : recopier son NIF dans la case STAT passe n'importe quel contrôle
 *   de forme. C'est pour ça qu'aucun badge de vérification ne se déduit de ce
 *   formulaire — c'est un humain qui accorde, après avoir regardé les pièces.
 *
 * ⚠ CE CONTRÔLE SERT À L'UTILISATEUR, PAS À NOUS. Il existe pour lui dire
 *   « il vous manque trois chiffres » AVANT cinq minutes de téléversement en
 *   3G, pas pour filtrer. D'où : on avertit, on ne bloque jamais.
 */
export function formeNif(v: string): { ok: boolean; message: string } {
  const n = v.replace(/\D/g, "");
  if (!n) return { ok: false, message: "" };
  if (n.length < 8) return { ok: false, message: `${n.length} chiffres — il en faut au moins 8.` };
  return { ok: true, message: `${n.length} chiffres` };
}

export function formeStat(v: string): { ok: boolean; message: string } {
  const n = v.replace(/[^0-9A-Za-z]/g, "");
  if (!n) return { ok: false, message: "" };
  if (n.length < 10) return { ok: false, message: `${n.length} caractères — il en faut au moins 10.` };
  return { ok: true, message: `${n.length} caractères` };
}

/**
 * OÙ TROUVER CES NUMÉROS.
 *
 * 🔴 SANS CETTE AIDE, LE FORMULAIRE PRODUIT DES DONNÉES FAUSSES. Un gérant de
 *    52 ans qui ne sait pas où chercher son STAT recopiera son NIF dans les
 *    deux cases — les deux passeront le contrôle de forme, et le dossier
 *    arrivera avec une information inventée de bonne foi. Le dire coûte trois
 *    phrases ; ne pas le dire coûte la fiabilité de toute la file d'attente.
 */
export const OU_TROUVER = {
  nif: "Sur votre carte fiscale ou votre attestation NIF, délivrée par le centre fiscal. C'est le numéro qui figure aussi sur vos factures.",
  stat: "Sur votre carte statistique, délivrée par l'INSTAT. Le numéro est en haut de la carte, sous « N° STAT ».",
  piece:
    "Une photo de votre carte statistique, de votre attestation NIF, de votre patente, ou de tout document à votre nom mentionnant l'établissement.",
} as const;
