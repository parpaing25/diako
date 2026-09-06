// alerte-erreurs — appelée par pg_cron toutes les 10 minutes quand
// journal_erreurs a reçu 3 erreurs ou plus (migration 0123). Résume les
// erreurs et prévient sur Telegram.
//
// 🔴 POURQUOI. Le 05/09/2026, un visiteur Android a vu cinq écrans d'erreur en
//    deux minutes ; le journal les avait, personne ne les a lues avant l'audit.
//
// Secrets attendus : ALERTE_SECRET (même valeur que vault.alerte_secret),
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. SUPABASE_URL et
// SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
// Déployée avec verify_jwt = false : l'appelant est pg_net, pas un compte ;
// l'authentification est l'en-tête x-alerte-secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("ALERTE_SECRET") ?? "";
  if (!secret || req.headers.get("x-alerte-secret") !== secret) {
    return new Response("refusé", { status: 401 });
  }

  let depuis = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let messageDirect: string | null = null;
  try {
    const corps = await req.json();
    if (typeof corps?.depuis === "string" && !Number.isNaN(Date.parse(corps.depuis))) depuis = new Date(corps.depuis).toISOString();
    /* ⭐ UN MESSAGE TOUT FAIT. Le veilleur des inscriptions (0125) n'a rien a
       resumer : il a deja sa phrase. On la transmet telle quelle plutot que de
       lui faire ecrire dans journal_erreurs, qui n'est pas fait pour ca. */
    if (typeof corps?.message === "string" && corps.message.trim()) {
      messageDirect = corps.message.slice(0, 3500);
    }
  } catch {
    /* corps absent : les 10 dernières minutes */
  }

  if (messageDirect) return await prevenir(messageDirect, { direct: true });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin
    .from("journal_erreurs")
    .select("message, chemin, navigateur, reseau, created_at")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return new Response(error.message, { status: 500 });
  const lignes = data ?? [];
  if (lignes.length === 0) return Response.json({ envoye: false, n: 0 });

  // Regroupe par message : « 5 × reading 'default' — /gouts, /favoris… »
  const parMessage = new Map<string, { n: number; chemins: Set<string> }>();
  for (const l of lignes) {
    const cle = (l.message ?? "?").slice(0, 80);
    const e = parMessage.get(cle) ?? { n: 0, chemins: new Set<string>() };
    e.n += 1;
    if (l.chemin) e.chemins.add(l.chemin);
    parMessage.set(cle, e);
  }
  const resume = [...parMessage.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 5)
    .map(([m, e]) => `• ${e.n} × ${m}\n  ${[...e.chemins].slice(0, 4).join(", ")}`)
    .join("\n");
  const mobiles = lignes.filter((l) => /Android|iPhone/i.test(l.navigateur ?? "")).length;
  const texte = `⚠️ Diako : ${lignes.length} erreur(s) depuis ${depuis.slice(11, 16)} UTC (${mobiles} sur mobile)\n${resume}\n\nselect * from journal_erreurs order by id desc limit 20;`;

  return await prevenir(texte, { n: lignes.length });
});

/** Envoie sur Telegram, ou journalise si le destinataire n'est pas encore posé. */
async function prevenir(texte: string, extra: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chat) {
    console.warn("[alerte-erreurs] Telegram non configuré —", texte);
    return Response.json({ envoye: false, ...extra, motif: "telegram non configuré" });
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texte, disable_web_page_preview: true }),
  });
  return Response.json({ envoye: r.ok, ...extra, statut: r.status });
}
