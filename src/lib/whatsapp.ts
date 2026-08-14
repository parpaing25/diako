/**
 * WhatsApp et numéros malgaches.
 *
 * Transcrit du projet frère, avec deux corrections. Là-bas,
 * `formatPhoneForDisplay` découpait un numéro international en tranches fixes
 * (2, 2, reste) qui ne correspondent pas au découpage malgache : un +261 se lit
 * « +261 34 12 345 67 », pas « +261 34 12 34567 ». Et `isValidWhatsAppNumber`
 * acceptait n'importe quelle suite de 10 à 15 chiffres, y compris un numéro
 * fixe qui n'a pas WhatsApp.
 *
 * Pourquoi ce module compte ici : à Madagascar, WhatsApp est le canal de
 * contact par défaut d'un hôtel ou d'une agence. Un lien qui n'ouvre pas la
 * bonne conversation, c'est une mise en relation perdue.
 */

/** Ne garde que les chiffres, et met le préfixe pays s'il manque. */
export function numeroInternational(tel: string): string {
  const chiffres = tel.replace(/\D/g, "");
  if (chiffres.startsWith("261")) return chiffres;
  // 0341234567 → 261341234567
  if (chiffres.startsWith("0")) return `261${chiffres.slice(1)}`;
  // 341234567 (saisi sans le zéro) → 261341234567
  if (/^3[2-9]\d{7}$/.test(chiffres)) return `261${chiffres}`;
  return chiffres;
}

/**
 * Les mobiles malgaches sont en 032 / 033 / 034 / 037 / 038 (neuf chiffres
 * après le zéro). Un fixe en 020 n'a pas WhatsApp : le proposer ferait perdre
 * du temps à l'utilisateur et de la crédibilité au site.
 */
export function estMobileMalgache(tel: string): boolean {
  const n = numeroInternational(tel);
  return /^2613[2-9]\d{7}$/.test(n);
}

/** Un numéro étranger reste valable pour WhatsApp : on ne l'écarte pas. */
export function peutRecevoirWhatsApp(tel: string | null | undefined): boolean {
  if (!tel) return false;
  const n = numeroInternational(tel);
  if (n.startsWith("261")) return estMobileMalgache(tel);
  return n.length >= 10 && n.length <= 15;
}

/** « +261 34 12 345 67 » — le découpage tel qu'on le lit et le dicte ici. */
export function afficherNumero(tel: string | null | undefined): string {
  if (!tel) return "";
  const n = numeroInternational(tel);
  if (/^261\d{9}$/.test(n)) {
    return `+261 ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 10)} ${n.slice(10)}`;
  }
  return tel.trim();
}

/**
 * Le lien wa.me, avec un premier message déjà écrit.
 *
 * Le message par défaut nomme l'établissement et dit d'où vient le contact :
 * un gérant qui reçoit « Bonjour » sans contexte ne sait pas quoi répondre, et
 * ne saura jamais que Diako lui a amené un client.
 */
export function lienWhatsApp(
  tel: string,
  options: { etablissement?: string; message?: string } = {}
): string {
  const n = numeroInternational(tel);
  const texte =
    options.message ??
    (options.etablissement
      ? `Bonjour, je vous contacte depuis Diako au sujet de ${options.etablissement}.`
      : "Bonjour, je vous contacte depuis Diako.");
  return `https://wa.me/${n}?text=${encodeURIComponent(texte)}`;
}

/** Le lien tel: — les espaces cassent la composition sur certains Android. */
export function lienAppel(tel: string): string {
  return `tel:+${numeroInternational(tel)}`;
}
