import { supabase } from "@/integrations/supabase/client";
import { journaliser } from "@/lib/journalErreurs";

// ============================================================================
// Chaîne d'images DIAKO — reprise telle quelle de Fonenako (cf. TDR §10.2).
//
// RÈGLE ABSOLUE : aucune image ne transite par Supabase Storage. Tout est
// hébergé sur o2switch. C'est ce seul point qui fait la différence entre
// ~70 Ko et ~1,2 Mo d'egress Supabase par visite — un facteur 17, et donc la
// différence entre tenir sur l'offre gratuite ou pas.
//
// Le endpoint PHP (public/api/o2upload.php) vérifie le JWT Supabase, contrôle
// les MAGIC BYTES (et pas seulement l'extension), interdit d'écrire hors du
// dossier de l'utilisateur, et génère une vignette WebP à côté de l'original.
// ============================================================================

export type UploadFolder = "profiles" | "posts" | "pages";

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/** Base du site — les fichiers sont servis par le même hôte que la SPA. */
function getBaseUrl(): string {
  return window.location.origin;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

/**
 * Téléverse un fichier vers o2switch, avec repli en cascade :
 *   1. JSON base64       (le seul mode qui passe le pare-feu d'o2switch)
 *   2. multipart direct  (repli, le jour où le pare-feu le laisse passer)
 * Les deux passent par le même endpoint authentifié.
 *
 * 🔴 L'ORDRE A ÉTÉ INVERSÉ LE 19/09/2026. Depuis début septembre, le pare-feu
 *    de l'hébergeur refuse en 406 (page HTML, avant PHP) TOUTE requête
 *    multipart qui porte un fichier sur diako.fonenako.mg — même un texte de
 *    7 octets, même une image de 8 × 8. Le JSON base64, lui, passe. Chaque
 *    photo partait donc DEUX fois : en entier en multipart pour rien, puis en
 *    base64 — le double du temps d'envoi en 3G. Le base64 coûte 33 % de plus
 *    qu'un multipart qui marche, mais moitié moins qu'un multipart refusé.
 * ⚠ Un échec final est JOURNALISÉ : jusque-là, un envoi raté ne laissait
 *   aucune trace, et le blocage est resté invisible deux semaines.
 */
export async function uploadToO2Switch(
  file: File,
  folder: UploadFolder
): Promise<UploadResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { success: false, error: "Vous devez être connecté." };

    // L'extension réelle est re-déduite côté serveur d'après les magic bytes :
    // celle-ci n'est qu'indicative.
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `${session.user.id}/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const endpoint = `${getBaseUrl()}/api/o2upload.php`;
    const essais: string[] = [];

    // ── 1. base64 ───────────────────────────────────────────────────────
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ file: base64, filename, folder }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) return { success: true, url: data.url };
      // Un refus rendu PAR PHP (fichier invalide, non autorisé, trop gros) ne se
      // rattrape pas en changeant de mode : on le rend tel quel.
      if (data?.error && res.status >= 400 && res.status < 500) {
        void journaliser({ message: `Téléversement refusé (${res.status}) : ${data.error}`, source: "o2switchUpload" });
        return { success: false, error: data.error };
      }
      essais.push(`base64 HTTP ${res.status}`);
    } catch (e) {
      essais.push(`base64 ${e instanceof Error ? e.message : "erreur"}`);
    }

    // ── 2. multipart ────────────────────────────────────────────────────
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", filename);
      form.append("folder", folder);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) return { success: true, url: data.url };
      essais.push(`multipart HTTP ${res.status}`);
      if (data?.error) {
        void journaliser({ message: `Téléversement refusé : ${essais.join(" · ")} — ${data.error}`, source: "o2switchUpload" });
        return { success: false, error: data.error };
      }
    } catch (e) {
      essais.push(`multipart ${e instanceof Error ? e.message : "erreur"}`);
    }

    void journaliser({ message: `Téléversement impossible : ${essais.join(" · ")}`, source: "o2switchUpload" });
    return { success: false, error: "L'envoi de la photo a échoué. Réessayez dans un instant." };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Erreur inconnue au téléversement.",
    };
  }
}

/**
 * Supprime des images o2switch. Le serveur n'autorise QUE le dossier de
 * l'utilisateur (vignettes comprises). Fire-and-forget : un échec laisse au
 * pire quelques fichiers orphelins, il ne doit jamais bloquer l'interface.
 */
export async function deleteFromO2Switch(urls: string[]): Promise<void> {
  try {
    const clean = (urls || []).filter((u) => typeof u === "string" && u.includes("/uploads/"));
    if (!clean.length) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${getBaseUrl()}/api/o2delete.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ urls: clean }),
    });
  } catch {
    /* non bloquant, volontairement silencieux */
  }
}
