// supprimer-mon-compte — efface le compte du membre CONNECTÉ, et rien d'autre.
//
// 🔴 L'IDENTIFIANT VIENT DU JETON VÉRIFIÉ, JAMAIS DU CORPS DE LA REQUÊTE
//    (règle CLAUDE.md : « jamais d'identifiant utilisateur venant du corps »).
//    Un appelant ne peut donc supprimer que lui-même.
//
// Ce que la suppression d'auth.users entraîne (pg_constraint relu le
// 05/09/2026) : profiles CASCADE → posts, comments, reactions, saves,
// page_saves, follows, messages, conversations, notifications, blocks,
// reports, reviews, page_claims, push_subscriptions, photo_propositions,
// page_gestionnaires.user_id CASCADE ; pages.owner_id, promo_codes.cree_par,
// photo_propositions.traite_par, page_gestionnaires.ajoute_par → SET NULL
// (0121). Une fiche revendiquée redevient sans propriétaire : voulu.
//
// ⚠ Les photos des récits sur o2switch ne sont pas effacées ici (il faudrait
//   la clé serveur d'o2delete.php dans les secrets) : elles deviennent
//   orphelines, hors de tout lien. À traiter par le nettoyage hebdomadaire des
//   fichiers sans référence (06-amelioration-continue).
//
// Déployée avec verify_jwt = false pour vérifier NOUS-MÊMES le jeton avec la
// clé anon (getUser), comme agent-diako : la plateforme ne vérifie pas les
// jetons des clés publishable récentes de la même façon.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://diako.fonenako.mg",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("méthode", { status: 405, headers: CORS });

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return Response.json({ ok: false, motif: "non connecté" }, { status: 401, headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: e1 } = await anon.auth.getUser();
  if (e1 || !user) return Response.json({ ok: false, motif: "session invalide" }, { status: 401, headers: CORS });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Trace minimale, sans identifiant : la date et le nombre de récits effacés.
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[supprimer-mon-compte]", error.message);
    return Response.json({ ok: false, motif: "suppression impossible" }, { status: 500, headers: CORS });
  }
  console.log(`[supprimer-mon-compte] compte effacé, ${count ?? 0} récit(s) avec lui`);
  return Response.json({ ok: true, recits: count ?? 0 }, { headers: CORS });
});
