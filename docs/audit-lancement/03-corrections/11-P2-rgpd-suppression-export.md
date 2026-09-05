# 03-11 — P2 · RGPD : supprimer son compte et exporter ses données depuis l'app

**Constat (02-FN8).** « Supprimer mon compte » (`Parametres.tsx:219-229`) affiche un toast qui renvoie à un e-mail Fonenako ; aucune fonction d'effacement ni d'export n'existe en base (0 fonction `*compte*`/`*export*` hors admin, 05/09).

## Ce que la base fait déjà (vérifié le 05/09, `pg_constraint`)

`profiles.id → auth.users` **ON DELETE CASCADE**, et depuis `profiles` : `posts.author_id`, `comments.author_id`, `reactions`, `saves`, `page_saves`, `follows`, `messages.sender_id`, `conversations.a_id/b_id`, `notifications`, `blocks`, `reports.reporter_id`, `reviews`, `page_claims`, `push_subscriptions`, `photo_propositions.proposeur_id`, `page_gestionnaires.user_id` → **CASCADE** ; `pages.owner_id`, `promo_codes.cree_par`, `photo_propositions.traite_par` → **SET NULL** ; `page_gestionnaires.ajoute_par` → **NO ACTION** (⚠ bloquerait la suppression d'un gérant qui a ajouté un cogestionnaire : passer en `set null`).

Supprimer `auth.users` efface donc tout, **y compris les récits** — ce qui est le comportement annoncé par le toast (« vos publications seront effacées »). Une fiche d'établissement revendiquée redevient sans propriétaire (SET NULL) : conforme.

## 1. Export — RPC `mes_donnees()` (0,5 h)

```sql
create or replace function public.mes_donnees()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(p) - 'search_vector' from public.profiles p where p.id = (select auth.uid())),
    'publications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.posts x where x.author_id = (select auth.uid())),
    'commentaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.comments x where x.author_id = (select auth.uid())),
    'reactions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.reactions x where x.user_id = (select auth.uid())),
    'carnet', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.saves x where x.user_id = (select auth.uid())),
    'gouts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.dish_tastings x where x.user_id = (select auth.uid())),
    'messages', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.messages x where x.sender_id = (select auth.uid())),
    'exporte_le', now()
  );
$$;
revoke all on function public.mes_donnees() from public, anon;
grant execute on function public.mes_donnees() to authenticated;
```
Client (`Parametres.tsx`) : bouton « Télécharger mes données » → `rpc("mes_donnees")` → `Blob` JSON → `<a download="diako-mes-donnees.json">`.

## 2. Suppression — Edge Function `supprimer-mon-compte` (1,5 h)

La suppression d'`auth.users` exige la clé `service_role` : elle vit **uniquement** dans les secrets de la fonction, jamais côté client ni dans le dépôt.
```ts
// supabase/functions/supprimer-mon-compte/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async (req) => {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return new Response("non connecté", { status: 401 });
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return new Response("session invalide", { status: 401 });
  // ⚠ L'identifiant vient du JWT vérifié, JAMAIS du corps de la requête (règle CLAUDE.md:28).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Les images des récits sur o2switch : appeler /api/o2delete.php par récit AVANT la cascade
  // (sinon les fichiers deviennent orphelins). Liste : select media from posts where author_id = user.id.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
```
Client : dialogue de confirmation (« Cette action est définitive. Vos récits, commentaires et messages seront effacés. ») → `supabase.functions.invoke("supprimer-mon-compte")` → `signOut()` → `/`. Journaliser l'événement (sans identifiant) dans `journal_erreurs`-like ou une table `journal_comptes` (date, motif facultatif).

Migration préalable : `alter table public.page_gestionnaires drop constraint <nom>, add constraint <nom> foreign key (ajoute_par) references public.profiles(id) on delete set null;`

## 3. Texte de `Confidentialite.tsx` (04) : « Vous pouvez télécharger vos données et supprimer votre compte depuis Paramètres ; la suppression est immédiate et définitive. Les sauvegardes techniques sont purgées sous 30 jours. »

## Vérification (compte de test, à la main)

1. Créer un compte jetable, publier 1 récit avec 1 photo, réagir à un récit.
2. « Télécharger mes données » → le JSON contient le récit et la réaction.
3. « Supprimer mon compte » → déconnexion ; `select count(*) from posts where author_id = '<id>'` = 0 ; la photo n'existe plus sur o2switch (`curl -I` → `text/html`, donc absente).
