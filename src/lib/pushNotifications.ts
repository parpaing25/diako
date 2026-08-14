import { supabase } from "@/integrations/supabase/client";

/**
 * NOTIFICATIONS PUSH — être prévenu même l'application fermée.
 *
 * À quoi ça sert vraiment ici : un voyageur écrit à une agence le soir, le
 * gérant répond le lendemain matin. Sans push, la réponse attend que le
 * voyageur pense à rouvrir le site — et une mise en relation qui prend
 * vingt-quatre heures ne se fait pas.
 *
 * ⚠ CLÉ PUBLIQUE DANS LE CODE, ET C'EST NORMAL. La clé VAPID publique est
 *   faite pour être distribuée : c'est elle qui permet au navigateur de
 *   vérifier que l'envoi vient bien de nous. La clé PRIVÉE, elle, n'existe que
 *   dans les secrets du projet Supabase et ne doit JAMAIS approcher ce dépôt,
 *   qui est public.
 */

const CLE_PUBLIQUE_VAPID =
  "BHrczCa3MlUwQmEWStYO7gONuuUBfxXP_mPRMbqh1BALj3pPPlXoR-d56Re9nY-O61wVdDtMLR00pTjeB9RTXiU";

/** Le format base64url de VAPID doit être converti en octets pour l'API. */
function base64UrlVersOctets(base64: string): ArrayBuffer {
  const bourrage = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + bourrage).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(normal);
  // ⚠ On rend l'ArrayBuffer et non la vue : le type de `applicationServerKey`
  //   n'accepte pas un Uint8Array dont le tampon pourrait etre partage.
  const tampon = new ArrayBuffer(brut.length);
  const octets = new Uint8Array(tampon);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return tampon;
}

export type EtatPush = "impossible" | "refuse" | "inactif" | "actif";

export function pushDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function etatPush(): Promise<EtatPush> {
  if (!pushDisponible()) return "impossible";
  if (Notification.permission === "denied") return "refuse";
  try {
    const sw = await navigator.serviceWorker.ready;
    const abo = await sw.pushManager.getSubscription();
    return abo ? "actif" : "inactif";
  } catch {
    return "impossible";
  }
}

/**
 * Active les notifications. Rend `false` sur refus — qui est une réponse
 * légitime, pas une erreur : on ne redemande pas, on ne réessaie pas.
 */
export async function activerPush(): Promise<boolean> {
  if (!pushDisponible()) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const sw = await navigator.serviceWorker.ready;
  const abo =
    (await sw.pushManager.getSubscription()) ??
    (await sw.pushManager.subscribe({
      // Obligatoire depuis Chrome 52 : une notification push doit toujours
      // être visible. Les envois silencieux ont été fermés partout.
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersOctets(CLE_PUBLIQUE_VAPID),
    }));

  const brut = abo.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!brut.endpoint || !brut.keys?.p256dh || !brut.keys?.auth) return false;

  // `endpoint` est unique : un même téléphone qui se réabonne met à jour sa
  // ligne au lieu d'en créer une seconde, sinon chaque notification partirait
  // en double.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: brut.endpoint,
      p256dh: brut.keys.p256dh,
      auth: brut.keys.auth,
      navigateur: navigator.userAgent.slice(0, 200),
      vu_le: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) return false;

  return true;
}

/** Coupe les notifications : côté navigateur ET côté base. */
export async function desactiverPush(): Promise<void> {
  if (!pushDisponible()) return;
  try {
    const sw = await navigator.serviceWorker.ready;
    const abo = await sw.pushManager.getSubscription();
    if (!abo) return;
    const endpoint = abo.endpoint;
    await abo.unsubscribe();
    // Sans cette suppression, le serveur continuerait d'écrire vers une
    // adresse morte jusqu'à ce qu'elle réponde 410.
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* rien à faire : l'abonnement finira par être purgé côté serveur */
  }
}
