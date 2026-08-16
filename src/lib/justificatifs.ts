import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompression";
import { estMobileMalgache } from "@/lib/whatsapp";

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
 *
 * ⚠ LA PHOTO DU LIEU PASSE PAR LE MÊME BUCKET PRIVÉ, ET CE N'EST PAS UN OUBLI.
 *   Elle n'est pourtant pas une pièce d'identité, et elle finira publique le
 *   jour où la fiche est accordée. Mais sur un Android d'entrée de gamme, la
 *   photo voisine de la façade dans la galerie est souvent une photo de
 *   famille : publier au dépôt, avant tout regard humain, c'est publier ce qui
 *   a été choisi par erreur. La recopie vers l'espace public se fera à
 *   l'acceptation, pas ici (migration 0078).
 */

const BUCKET = "justificatifs";

/** Les deux pièces qu'on sait recevoir — aussi le préfixe du nom déposé. */
export type UsagePiece = "piece" | "photo_lieu";

/**
 * CE QU'ON ACCEPTE, ET RIEN D'AUTRE.
 *
 * ⚠ ON NE DÉPASSE JAMAIS LA LISTE DU BUCKET. `allowed_mime_types` de la
 *   migration 0078 vaut exactement jpeg / png / webp / pdf : un type de plus
 *   ici passerait nos contrôles pour se faire refuser par Storage APRÈS le
 *   téléversement — donc au pire moment, sur une 3G déjà consommée. En
 *   dessous, en revanche, on a le droit d'être plus strict, et on l'est.
 *
 * ⚠ LA PHOTO DU LIEU N'ACCEPTE PAS LE PDF, et ce n'est pas un oubli. On
 *   demande une prise de vue faite sur place : c'est la seule preuve qui ne se
 *   recopie pas depuis une facture affichée au comptoir. Un PDF, lui, s'exporte
 *   de n'importe où — l'accepter viderait l'exigence de son sens.
 *   ⚠ ET LA BASE NE RATTRAPERA PAS CE CAS-LÀ. La migration 0084 vérifie que le
 *     fichier existe et qu'il a été déposé par ce compte, pas son type. Cette
 *     règle-ci n'a donc aucun filet en dessous : ne la relâchez pas ici.
 */
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];
const TYPES_OK: Record<UsagePiece, string[]> = {
  piece: [...TYPES_IMAGE, "application/pdf"],
  photo_lieu: [...TYPES_IMAGE],
};
const TAILLE_MAX = 6 * 1024 * 1024;

/**
 * L'ATTRIBUT `accept` DU SÉLECTEUR, ÉCRIT DEPUIS LA LISTE QUI REFUSE.
 *
 * 🔴 L'ÉCRAN INVITAIT DES FORMATS QUE CE FICHIER REFUSE. La photo du lieu
 *    portait `accept="image/*"` : un HEIC — le réglage d'usine de beaucoup
 *    d'iPhone et de Samsung — passait le sélecteur, attendait sa compression,
 *    puis se faisait renvoyer ici. Sur une 3G malgache, l'échec arrivait après
 *    l'attente, et rien à l'écran n'avait prévenu. En dérivant `accept` de la
 *    même constante que le contrôle, les deux ne peuvent plus diverger.
 */
export const ACCEPT_FICHIER: Record<UsagePiece, string> = {
  piece: TYPES_OK.piece.join(","),
  photo_lieu: TYPES_OK.photo_lieu.join(","),
};

/**
 * LA MÊME RÈGLE, EN FRANÇAIS, À AFFICHER SOUS LE CHAMP.
 *
 * ⚠ `accept` ne suffit pas : il grise les fichiers refusés sans dire pourquoi,
 *   et quelqu'un qui ne retrouve pas sa photo dans la liste conclut que le site
 *   est cassé. On nomme donc le cas HEIC et ce qu'il faut en faire.
 */
const NOTE_HEIC =
  "Une photo HEIC — le format d'usine de beaucoup d'iPhone et de Samsung — n'apparaîtra pas dans la liste : rouvrez-la dans votre galerie et enregistrez-la en JPG.";

export const FORMATS_LISIBLES: Record<UsagePiece, string> = {
  piece: `Formats acceptés : JPG, PNG, WEBP ou PDF. Le PDF n'est pas réduit : 6 Mo maximum. ${NOTE_HEIC}`,
  photo_lieu: `Formats acceptés : JPG, PNG ou WEBP — pas de PDF, on attend une photo prise sur place. ${NOTE_HEIC}`,
};

export async function televerserPiece(fichier: File, quoi: UsagePiece): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Connexion requise.");

  // ⚠ LE REFUS NOMME LES FORMATS DE CE CHAMP-LÀ, pas une liste générale : dire
  //   « ou PDF » à quelqu'un qui joint la photo du lieu l'enverrait rechercher
  //   un fichier qu'on refusera aussi.
  const typesOk = TYPES_OK[quoi];
  if (!typesOk.includes(fichier.type)) {
    throw new Error(
      quoi === "photo_lieu"
        ? "Cette photo n'est pas dans un format que nous savons lire. Formats acceptés : JPG, PNG ou WEBP."
        : "Ce fichier n'est pas dans un format que nous savons lire. Formats acceptés : JPG, PNG, WEBP ou PDF."
    );
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

  // 🔴 ON ÉTIQUETAIT LE FICHIER AVEC LE TYPE D'AVANT LA COMPRESSION. Une capture
  //    d'écran d'attestation NIF est un PNG sur Android ; `compressImage` la
  //    rend en JPEG (son `fileType` par défaut), et on la déposait quand même
  //    en `.png` avec `Content-Type: image/png`. L'objet stocké contenait donc
  //    du JPEG sous une étiquette PNG : les navigateurs devinent et l'affichent,
  //    mais un outil qui fait confiance à l'en-tête rend un fichier illisible —
  //    et un vérificateur qui ne peut pas ouvrir la pièce refuse le dossier.
  // ⚠ On étiquette ce qu'on envoie VRAIMENT, pas ce qu'on a reçu. Le repli sur
  //   le type d'origine garde un type déjà validé si la compression rendait
  //   autre chose que prévu — jamais un type que le bucket refuserait.
  const typeReel = typesOk.includes(charge.type) ? charge.type : fichier.type;
  const ext =
    typeReel === "application/pdf"
      ? "pdf"
      : typeReel === "image/png"
        ? "png"
        : typeReel === "image/webp"
          ? "webp"
          : "jpg";

  // ⚠ Un nom imprévisible : le bucket est privé, mais un nom devinable reste
  //   une mauvaise habitude — et les URL signées circulent par messagerie.
  const alea = crypto.randomUUID();
  const chemin = `${user.id}/${quoi}-${alea}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(chemin, charge, { contentType: typeReel, upsert: false });
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
 * LE NUMÉRO OÙ L'ON RAPPELLE.
 *
 * 🔴 UN DOSSIER SANS NUMÉRO JOIGNABLE EST UN DOSSIER MORT. La vérification se
 *    termine par un appel : c'est ainsi qu'on distingue le gérant de celui qui
 *    a recopié un NIF trouvé sur une facture. Sans numéro, le dossier reste en
 *    file d'attente jusqu'à la purge, et son déposant ne saura jamais pourquoi.
 *
 * ⚠ UN NUMÉRO ÉTRANGER N'EST PAS ÉCARTÉ. Beaucoup de propriétaires vivent hors
 *   de Madagascar et gèrent par téléphone ; `whatsapp.ts` pose déjà cette règle
 *   pour les fiches, on ne la contredit pas ici. On reconnaît le mobile
 *   malgache pour rassurer, on accepte le reste dès qu'il y a de quoi composer.
 */
export function formeTel(v: string): { ok: boolean; message: string } {
  const n = v.replace(/\D/g, "");
  if (!n) return { ok: false, message: "" };
  if (estMobileMalgache(v)) return { ok: true, message: "Mobile malgache reconnu" };
  // ⚠ Neuf chiffres, c'est un mobile malgache saisi sans son zéro (341234567) :
  //   en dessous, il n'y a aucun numéro composable, quel que soit le pays.
  //
  // 🔴 LE MESSAGE ANNONÇAIT UNE RÈGLE QUE CE CODE N'APPLIQUE PAS. Il disait
  //    « un numéro malgache en compte 10 » alors que le seuil testé est 9, et
  //    il le disait au propriétaire à l'étranger que le commentaire ci-dessus
  //    dit vouloir accepter : celui-ci lisait qu'on exigeait un numéro
  //    malgache, et fermait le formulaire alors que son numéro passait. On
  //    énonce désormais le seuil réellement appliqué, sans nommer de pays.
  if (n.length < 9) {
    return { ok: false, message: `${n.length} chiffres — il en faut au moins 9.` };
  }
  return { ok: true, message: `${n.length} chiffres — nous vous rappelons dessus.` };
}

/**
 * OÙ TROUVER CES NUMÉROS, ET À QUOI SERT CHAQUE PIÈCE.
 *
 * 🔴 SANS CETTE AIDE, LE FORMULAIRE PRODUIT DES DONNÉES FAUSSES. Un gérant de
 *    52 ans qui ne sait pas où chercher son STAT recopiera son NIF dans les
 *    deux cases — les deux passeront le contrôle de forme, et le dossier
 *    arrivera avec une information inventée de bonne foi. Le dire coûte trois
 *    phrases ; ne pas le dire coûte la fiabilité de toute la file d'attente.
 *
 * 🔴 ET UNE EXIGENCE SANS RAISON FAIT ABANDONNER. Depuis que la photo du lieu
 *    est obligatoire, elle doit dire ce qu'elle prouve dans la phrase même où
 *    on la demande : « encore un fichier à joindre » se referme, « la seule
 *    chose qui montre que vous y êtes » se photographie.
 *
 * ⚠ ON NOMME LES GUICHETS, ON N'INVENTE NI ADRESSE NI DÉLAI. Le centre fiscal
 *   et l'INSTAT suffisent à savoir où chercher ; un horaire ou un tarif écrit
 *   ici serait faux quelque part dans le pays, et enverrait quelqu'un pour rien.
 */
export const OU_TROUVER = {
  nif: "Sur votre carte fiscale, ou sur l'attestation d'immatriculation délivrée par le centre fiscal dont dépend l'établissement. Le même numéro figure sur votre patente et sur vos factures.",
  stat: "Sur votre carte statistique, délivrée par l'INSTAT — le numéro est en haut de la carte, sous « N° STAT ». Si l'entreprise a été créée au guichet unique de l'EDBM, cette carte vous a été remise avec le NIF, dans le même dossier.",
  piece:
    "Une photo de votre carte statistique, de votre attestation NIF, de votre patente, ou de tout document à votre nom mentionnant l'établissement.",
  photoLieu:
    "La façade, l'enseigne ou l'entrée, prise sur place : c'est elle qui montre que vous y êtes, alors qu'un numéro, lui, se recopie sur une facture. Elle reste dans l'espace privé avec vos pièces et n'est publiée qu'à l'acceptation.",
} as const;
