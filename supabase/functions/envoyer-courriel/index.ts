// envoyer-courriel — le hook « Send Email » de Supabase.
//
// 🔴 POURQUOI CETTE FONCTION EXISTE (06/09/2026, mesuré). Aucun courriel
//    d'inscription n'est jamais arrivé sur Diako : le compte de test du 23/08 a
//    encore email_confirmed_at à null, et celui d'aujourd'hui n'a rien reçu.
//    La cause a été isolée par quatre messages envoyés dans la MÊME session
//    SMTP vers la MÊME boîte :
//      A. sujet avec tiret cadratin + accents, TEXTE BRUT  → arrivé
//      C. témoin texte simple                              → arrivé
//      B. gabarit HTML de 4,6 Ko                           → JAMAIS ARRIVÉ
//      D. HTML minimal de 119 caractères (un lien)         → JAMAIS ARRIVÉ
//    Le serveur mutualisé accepte le message (250 OK) puis ne le remet pas dès
//    qu'il porte une partie HTML. Or GoTrue n'envoie QUE du HTML.
//
//    Ce hook reprend donc la main : Supabase nous appelle, et nous envoyons
//    nous-mêmes, en TEXTE BRUT, par le SMTP d'o2switch (port 587, STARTTLS) —
//    dialogue prouvé depuis cette infrastructure : « 235 Authentication
//    succeeded », « RCPT TO 250 Accepted ».
//
// ⚠ LE PORT 587, PAS 465. Depuis l'infrastructure Supabase, le 465 casse la
//   connexion (Broken pipe) ; le 587 avec STARTTLS passe. Le 465 était
//   configuré depuis le 31/07 — c'est la deuxième moitié de la panne.
//
// ⚠ Le jour où le HTML sera débloqué (demande au support o2switch, ou relais
//   dédié type Brevo/Resend), il suffira de désactiver ce hook : les gabarits
//   français restent en place dans la configuration.
//
// Secrets attendus : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
// SEND_EMAIL_HOOK_SECRET (format « v1,whsec_<base64> », posé par Supabase).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ── Un client SMTP minimal, écrit à la main ────────────────────────────────
   Deno.connect + Deno.startTls suffisent, et c'est exactement le dialogue
   vérifié depuis cette infrastructure. Aucune dépendance à installer. */
async function lire(conn: Deno.Reader, ms = 15000): Promise<string> {
  const tampon = new Uint8Array(4096);
  const n = await Promise.race([
    conn.read(tampon),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
  if (n === null) throw new Error("silence du serveur");
  return dec.decode(tampon.subarray(0, n as number)).trim();
}

async function dire(conn: Deno.Writer, ligne: string, attendu: RegExp, quoi: string): Promise<string> {
  await conn.write(enc.encode(ligne + "\r\n"));
  const r = await lire(conn);
  if (!attendu.test(r)) throw new Error(`${quoi} refusé : ${r.slice(0, 120)}`);
  return r;
}

/** Sujet en UTF-8 pour un en-tête (RFC 2047) : « Diako — confirmez… » passe. */
function sujetEncode(s: string): string {
  const octets = enc.encode(s);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return "=?UTF-8?B?" + btoa(bin) + "?=";
}

function corpsBase64(s: string): string {
  const octets = enc.encode(s);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  const b64 = btoa(bin);
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

async function envoyer(destinataire: string, sujet: string, texte: string): Promise<void> {
  const hote = Deno.env.get("SMTP_HOST")!;
  const port = Number(Deno.env.get("SMTP_PORT") ?? "587");
  const user = Deno.env.get("SMTP_USER")!;
  const pass = Deno.env.get("SMTP_PASS")!;
  const de = Deno.env.get("SMTP_FROM") ?? user;

  let conn: Deno.Conn = await Deno.connect({ hostname: hote, port });
  try {
    const banniere = await lire(conn);
    if (!/^220/.test(banniere)) throw new Error("bannière inattendue : " + banniere.slice(0, 80));
    await dire(conn, "EHLO diako.fonenako.mg", /^250/, "EHLO");
    await dire(conn, "STARTTLS", /^220/, "STARTTLS");
    conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: hote });
    await dire(conn, "EHLO diako.fonenako.mg", /^250/, "EHLO chiffré");
    await dire(conn, "AUTH LOGIN", /^334/, "AUTH LOGIN");
    await dire(conn, btoa(user), /^334/, "utilisateur");
    await dire(conn, btoa(pass), /^235/, "authentification");
    await dire(conn, `MAIL FROM:<${de}>`, /^250/, "MAIL FROM");
    await dire(conn, `RCPT TO:<${destinataire}>`, /^250|^251/, "RCPT TO");
    await dire(conn, "DATA", /^354/, "DATA");

    const entetes = [
      `From: Diako <${de}>`,
      `To: <${destinataire}>`,
      `Subject: ${sujetEncode(sujet)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@diako.fonenako.mg>`,
      "MIME-Version: 1.0",
      // ⚠ TEXTE BRUT UNIQUEMENT : une partie HTML n'est jamais remise (voir en-tête).
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "Auto-Submitted: auto-generated",
    ].join("\r\n");
    // Le point final sur sa propre ligne termine DATA ; le corps est en base64,
    // donc aucune ligne ne peut commencer par un point.
    await conn.write(enc.encode(entetes + "\r\n\r\n" + corpsBase64(texte) + "\r\n.\r\n"));
    const fin = await lire(conn, 30000);
    if (!/^250/.test(fin)) throw new Error("message refusé : " + fin.slice(0, 120));
    await conn.write(enc.encode("QUIT\r\n"));
  } finally {
    try { conn.close(); } catch { /* déjà fermée */ }
  }
}

/* ── Vérification de la signature du hook (Standard Webhooks) ────────────── */
async function signatureValide(req: Request, corpsBrut: string): Promise<boolean> {
  const brut = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
  if (!brut) return false;
  const secretB64 = brut.replace(/^v1,\s*whsec_/, "").replace(/^whsec_/, "");
  const id = req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("webhook-timestamp") ?? "";
  const sigs = (req.headers.get("webhook-signature") ?? "").split(" ");
  if (!id || !ts || !sigs.length) return false;
  // Horodatage à 5 minutes près : une signature rejouée plus tard est refusée.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  const cle = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const attendu = new Uint8Array(await crypto.subtle.sign("HMAC", cle, enc.encode(`${id}.${ts}.${corpsBrut}`)));
  let bin = "";
  for (const o of attendu) bin += String.fromCharCode(o);
  const attenduB64 = btoa(bin);
  return sigs.some((s) => s.split(",").pop() === attenduB64);
}

/* ── Les textes, en français, sans HTML ───────────────────────────────────── */
function message(action: string, lien: string, code: string): { sujet: string; texte: string } {
  const pied =
    "\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera fait." +
    "\n\n--\nDiako — où dormir, où manger et avec qui partir à Madagascar\nhttps://diako.fonenako.mg";
  switch (action) {
    case "signup":
      return {
        sujet: "Diako — confirmez votre adresse e-mail",
        texte: `Bienvenue sur Diako.\n\nPour terminer votre inscription, ouvrez ce lien :\n${lien}\n\nCe lien est valable une heure. Votre code, si on vous le demande : ${code}${pied}`,
      };
    case "recovery":
      return {
        sujet: "Diako — réinitialiser votre mot de passe",
        texte: `Vous avez demandé un nouveau mot de passe.\n\nOuvrez ce lien pour en choisir un :\n${lien}\n\nCe lien est valable une heure. Votre code, si on vous le demande : ${code}${pied}`,
      };
    case "magiclink":
      return {
        sujet: "Diako — votre lien de connexion",
        texte: `Voici votre lien de connexion à Diako :\n${lien}\n\nIl est valable une heure et ne sert qu'une fois. Votre code : ${code}${pied}`,
      };
    case "email_change":
    case "email_change_new":
      return {
        sujet: "Diako — confirmez votre nouvelle adresse",
        texte: `Vous avez demandé à changer l'adresse e-mail de votre compte Diako.\n\nConfirmez-la ici :\n${lien}\n\nCe lien est valable une heure. Votre code : ${code}${pied}`,
      };
    case "invite":
      return {
        sujet: "Diako — vous êtes invité",
        texte: `Vous êtes invité à rejoindre Diako.\n\nOuvrez ce lien pour créer votre compte :\n${lien}${pied}`,
      };
    default:
      return {
        sujet: "Diako — vérification",
        texte: `Ouvrez ce lien pour continuer :\n${lien}\n\nVotre code : ${code}${pied}`,
      };
  }
}

Deno.serve(async (req: Request) => {
  const brut = await req.text();
  if (!(await signatureValide(req, brut))) {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "signature invalide" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const { user, email_data } = JSON.parse(brut);
    const destinataire: string = user?.email;
    const action: string = email_data?.email_action_type ?? "signup";
    const projet = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
    const redirection = email_data?.redirect_to || "https://diako.fonenako.mg/";
    const lien =
      `${projet}/auth/v1/verify?token=${encodeURIComponent(email_data?.token_hash ?? "")}` +
      `&type=${encodeURIComponent(action)}&redirect_to=${encodeURIComponent(redirection)}`;
    const { sujet, texte } = message(action, lien, String(email_data?.token ?? ""));
    if (!destinataire) throw new Error("destinataire absent");
    await envoyer(destinataire, sujet, texte);
    console.log(`[envoyer-courriel] ${action} remis à ${destinataire.replace(/(.).*(@.*)/, "$1…$2")}`);
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    // Le message d'erreur remonte à GoTrue, qui le rend à l'appelant : la
    // personne qui s'inscrit saura que l'envoi a échoué, au lieu d'attendre
    // un courriel qui ne viendra jamais.
    console.error("[envoyer-courriel]", String(e));
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: "envoi impossible : " + String(e).slice(0, 160) } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
