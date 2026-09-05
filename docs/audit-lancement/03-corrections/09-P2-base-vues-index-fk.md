# 03-09 — P2 · Base : vues ouvertes à l'écriture, clés étrangères sans index, `dk_famille_carte`, policies multiples

## 1. `page_views` : insertion ouverte (02-SE8)

Aujourd'hui : policy `page_views_insert | INSERT | roles={public} | with_check=true`, trigger `page_views_compte` → `dk_compter_vue()` (incrémente des compteurs). Un script peut gonfler les vues d'une fiche ou remplir la table (1 163 lignes le 05/09, 71 sur 24 h : pas encore de dérive, mais rien ne l'empêche).

Migration `0120_vues_par_rpc_plafonnee.sql` :
```sql
-- Une vue s'enregistre par RPC, plafonnée par session et par minute ;
-- l'insertion directe est fermée.
create or replace function public.noter_vue(p_path text, p_ref text default null, p_sid uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_path is null or length(p_path) > 200 or p_path !~ '^/' then return; end if;
  -- 60 vues par session et par minute : un humain n'en fait pas 10.
  insert into public.agent_rate (cle, minute, n)
  values ('vue:' || coalesce(p_sid::text, 'anon'), date_trunc('minute', now()), 1)
  on conflict (cle, minute) do update set n = agent_rate.n + 1
  returning n into v_n;
  if v_n > 60 then return; end if;
  insert into public.page_views (path, ref, sid) values (p_path, left(p_ref, 200), p_sid);
end $$;
revoke all on function public.noter_vue(text, text, uuid) from public;
grant execute on function public.noter_vue(text, text, uuid) to anon, authenticated;
drop policy if exists page_views_insert on public.page_views;
-- Contrôle : anon ne peut plus insérer directement.
do $$ begin
  if exists (select 1 from pg_policies where tablename='page_views' and cmd='INSERT') then
    raise exception '0120 : une policy INSERT subsiste sur page_views';
  end if;
end $$;
```
Client : remplacer `supabase.from("page_views").insert({...})` par `supabase.rpc("noter_vue", { p_path, p_ref, p_sid })` (un seul appelant, à confirmer par `grep -rn '"page_views"' src`). ⚠ Déployer le client **après** la migration, ou garder les deux chemins une semaine.

## 2. Clés étrangères sans index (advisor `unindexed_foreign_keys` : 25)

Les tables sociales sont vides aujourd'hui ; elles ne le resteront pas. Index à créer avant le lancement, en une migration `0121_index_fk_sociales.sql` :
```sql
create index concurrently if not exists comments_author_id_idx on public.comments (author_id);
create index concurrently if not exists comments_parent_id_idx on public.comments (parent_id);
create index concurrently if not exists saves_post_id_idx on public.saves (post_id);
create index concurrently if not exists messages_sender_id_idx on public.messages (sender_id);
create index concurrently if not exists follows_target_id_idx on public.follows (target_id);
-- + les 20 autres : lister avec
-- select conrelid::regclass, a.attname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
--  where contype='f' and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum = any(i.indkey));
```
⚠ `concurrently` ne passe pas dans une transaction : appliquer par le connecteur instruction par instruction, ou sans `concurrently` (tables vides : instantané).

## 3. `dk_famille_carte` sans `search_path` (advisor `function_search_path_mutable`)

```sql
alter function public.dk_famille_carte set search_path = public;
```
(vérifier la signature exacte : `select oidvectortypes(proargtypes) from pg_proc where proname='dk_famille_carte'`).

## 4. 138 `multiple_permissive_policies` — après le lancement

Fusionner par table les policies `select` en une seule avec `or` ; commencer par `posts`, `pages`, `profiles` (les plus lues). Gain : lisibilité et un peu de temps par requête ; aucun effet de sécurité tant que les conditions restent les mêmes. À faire avec un banc de contrôle (`scripts/verifier_contrat_client_base.py`) avant/après.

## 5. 17 index inutilisés (advisor) — à laisser tant que le trafic est nul : un index « inutilisé » sur 1 163 vues ne prouve rien. Revoir à 30 jours de trafic réel.
