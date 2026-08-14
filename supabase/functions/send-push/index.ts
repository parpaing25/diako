// ============================================================================
// ENVOI DE NOTIFICATIONS PUSH — même téléphone verrouillé, application fermée.
//
// Déclenchée par deux déclencheurs de base (migration 0019) :
//   · INSERT sur public.notifications → « Untel a aimé votre récit »
//   · INSERT sur public.messages      → « Nouveau message de … »
//
// ⚠⚠ LA RÈGLE DE SÉCURITÉ QUI COMMANDE TOUT LE RESTE.
//
//   Cette URL est joignable par n'importe qui. La version d'origine du projet
//   frère lisait le TITRE, le MESSAGE, le LIEN et le DESTINATAIRE directement
//   dans le corps de la requête : n'importe qui pouvait donc faire arriver sur
//   le téléphone de tous les membres une notification signée par le site,
//   disant ce qu'il voulait, avec le lien de son choix. Hameçonnage parfait.
//   (Constat SEC-04 de leur audit du 08/08/2026.)
//
//   Ici, le corps ne sert QU'À DÉSIGNER UNE LIGNE — son identifiant. Tout le
//   contenu est relu en base. Une requête forgée ne peut, au pire, que
//   réexpédier une VRAIE notification à son VRAI destinataire.
//
//   Conséquence heureuse : il n'y a rien à protéger par un secret, donc le
//   déclencheur SQL n'a besoin d'aucune clé. C'est ce qui évite de reproduire
//   l'autre défaut du projet frère — la clé service_role en clair dans deux
//   fonctions de base, lisible par quiconque a accès au catalogue.
//
// Secrets requis sur le projet : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  "mailto:no-reply@diako.fonenako.mg",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

interface Charge {
  userId: string;
  titre: string;
  corps: string;
  url: string;
  tag: string;
}

/**
 * Relit la ligne en base. Une seconde tentative parce que le déclencheur part
 * AVANT la validation de la transaction : la fonction peut arriver avant que
 * la ligne ne soit visible.
 */
async function ligneReelle(table: string, id: unknown): Promise<Record<string, unknown> | null> {
  if (!id) return null;
  for (let essai = 0; essai < 2; essai++) {
    const { data } = await supabase.from(table).select("*").eq("id", id as string).maybeSingle();
    if (data) return data as Record<string, unknown>;
    if (essai === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/** Un aperçu de message, jamais le message entier sur un écran verrouillé. */
function apercu(texte: string): string {
  const t = String(texte ?? "").trim();
  if (!t) return "Nouveau message";
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif)/i.test(t)) return "📷 Photo";
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

async function resoudre(hook: {
  table?: string;
  record?: { id?: string };
}): Promise<Charge | null> {
  const recu = hook?.record;
  if (!recu?.id || !hook.table) return null;

  if (hook.table === "notifications") {
    const l = await ligneReelle("notifications", recu.id);
    if (!l) return null;
    const donnees = l.data as { url?: string } | null;
    return {
      userId: l.user_id as string,
      titre: (l.title as string) || "Diako",
      corps: (l.message as string) || "",
      url: donnees?.url || "/notifications",
      tag: `notif-${(l.type as string) || "general"}`,
    };
  }

  if (hook.table === "messages") {
    const l = await ligneReelle("messages", recu.id);
    if (!l) return null;

    const { data: conv } = await supabase
      .from("conversations")
      .select("a_id, b_id, page_id")
      .eq("id", l.conv_id as string)
      .maybeSingle();
    if (!conv) return null;

    // Le destinataire est l'AUTRE participant. On ne se notifie jamais soi-même.
    const cible = conv.a_id === l.sender_id ? conv.b_id : conv.a_id;
    if (!cible || cible === l.sender_id) return null;

    // Quand la conversation porte sur un établissement, c'est SON nom qui
    // parle au gérant — pas celui du voyageur, qu'il ne connaît pas encore.
    let expediteur = "un voyageur";
    if (conv.page_id) {
      const { data: page } = await supabase
        .from("pages")
        .select("name, owner_id")
        .eq("id", conv.page_id as string)
        .maybeSingle();
      if (page && page.owner_id === cible) expediteur = `un voyageur — ${page.name}`;
      else if (page) expediteur = page.name as string;
    } else {
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", l.sender_id as string)
        .maybeSingle();
      if (p?.display_name) expediteur = p.display_name;
    }

    return {
      userId: cible as string,
      titre: `Message de ${expediteur}`,
      corps: apercu(l.body as string),
      url: `/messages?c=${l.conv_id}`,
      // Le tag regroupe : dix messages d'une même conversation remplacent la
      // notification précédente au lieu d'empiler dix lignes.
      tag: `msg-${l.conv_id}`,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const hook = await req.json();
    const charge = await resoudre(hook);
    if (!charge) return new Response(JSON.stringify({ ignore: true }), { status: 200 });

    const { data: abos } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", charge.userId);

    if (!abos?.length) return new Response(JSON.stringify({ envoyes: 0 }), { status: 200 });

    const corps = JSON.stringify({
      title: charge.titre,
      body: charge.corps,
      url: charge.url,
      tag: charge.tag,
    });

    let envoyes = 0;
    await Promise.all(
      abos.map(async (a) => {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            corps
          );
          envoyes++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          // 404 / 410 = abonnement mort (application désinstallée, permission
          // retirée). On purge : sinon la table gonfle d'adresses fantômes et
          // chaque envoi perd du temps à leur écrire.
          if (code === 404 || code === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", a.id);
          }
        }
      })
    );

    return new Response(JSON.stringify({ envoyes }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-push]", String(e).slice(0, 300));
    return new Response(JSON.stringify({ erreur: true }), { status: 500 });
  }
});
