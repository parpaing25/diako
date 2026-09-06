-- ============================================================================
-- 0124 — noter_vue : TROIS PLAFONDS, DONT DEUX QUE L'APPELANT NE CHOISIT PAS
--
-- 🔴 CE QUE 0120 N'AVAIT PAS FERMÉ (revue adversariale du 06/09/2026). Son
--    plafond de 60 par minute portait sur `p_sid` — une valeur fournie par le
--    CLIENT. Il suffisait d'un identifiant neuf à chaque appel pour gonfler
--    `page_views` sans aucune limite, donc `views_count` (0092), le compteur
--    montré au gérant sur /pro (EspacePro.tsx) et le score « en vogue »
--    (0077b). La migration disait fermer cet abus ; elle ne le fermait pas.
--    Son bloc de contrôle appelait la fonction UNE fois : il ne pouvait pas
--    le voir.
--
-- Trois compteurs cumulés, dans cet ordre. Le premier borne l'empoisonnement
-- d'UNE fiche, le deuxième borne UN appelant, le troisième reste le confort
-- de 0120 :
--   (a) 'vuep:' || chemin   — 120 par minute. La page la plus vue du site en
--       fait moins d'une par minute : le seuil laisse passer plus de cent fois
--       le trafic réel avant de mordre.
--   (b) 'vuei:' || adresse  — 600 par minute. LARGE À DESSEIN : Madagascar est
--       massivement derrière du CGNAT, des dizaines de visiteurs partagent une
--       même adresse publique. Un seuil serré couperait de vrais lecteurs.
--   (c) 'vue:'  || p_sid    — 60 par minute, inchangé.
--
-- ⚠ L'ADRESSE EST LUE CÔTÉ SERVEUR, dans `request.headers` que PostgREST pose
--   lui-même — jamais dans un paramètre. Un appelant qui la choisirait
--   rouvrirait exactement la porte que cette migration ferme. Absente (appel
--   SQL direct, en-tête manquant), le plafond (b) est simplement sauté : les
--   deux autres tiennent.
-- ============================================================================

create or replace function public.noter_vue(p_path text, p_ref text default null, p_sid text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_ip text;
begin
  -- Un chemin de page, rien d'autre : pas d'URL absolue, pas de texte libre.
  if p_path is null or length(p_path) > 200 or p_path !~ '^/' then
    return;
  end if;

  -- (a) PAR CHEMIN. C'est CE plafond qui protège une fiche donnée, parce qu'il
  --     ne dépend d'aucune valeur choisie par l'appelant.
  insert into public.agent_rate (cle, minute, n)
  values ('vuep:' || left(p_path, 120), date_trunc('minute', now()), 1)
  on conflict (cle, minute) do update set n = agent_rate.n + 1
  returning n into v_n;
  if v_n > 120 then
    return;
  end if;

  -- (b) PAR APPELANT, d'après l'en-tête posé par PostgREST. Le `begin/exception`
  --     couvre l'appel hors HTTP, où le réglage n'existe pas ou n'est pas du
  --     JSON : on ne fait alors simplement pas ce contrôle.
  begin
    v_ip := nullif(btrim(split_part(
      coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''),
      ',', 1)), '');
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null then
    insert into public.agent_rate (cle, minute, n)
    values ('vuei:' || left(v_ip, 45), date_trunc('minute', now()), 1)
    on conflict (cle, minute) do update set n = agent_rate.n + 1
    returning n into v_n;
    if v_n > 600 then
      return;
    end if;
  end if;

  -- (c) PAR SESSION — le confort de 0120, gardé tel quel : il lisse le cas
  --     courant (un onglet qui se recharge) sans rien garantir contre un abus.
  insert into public.agent_rate (cle, minute, n)
  values ('vue:' || coalesce(left(p_sid, 63), 'anon'), date_trunc('minute', now()), 1)
  on conflict (cle, minute) do update set n = agent_rate.n + 1
  returning n into v_n;
  if v_n > 60 then
    return;
  end if;

  insert into public.page_views (path, ref, sid)
  values (p_path, left(p_ref, 200), left(p_sid, 63));
end $$;

comment on function public.noter_vue(text, text, text) is
  'Enregistre une page vue. Trois plafonds par minute : 120 par chemin, 600 par adresse appelante (lue dans request.headers), 60 par session. Le plafond par session seul, de 0120, était contournable — il repose sur une valeur fournie par le client (0124).';

revoke all on function public.noter_vue(text, text, text) from public;
grant execute on function public.noter_vue(text, text, text) to anon, authenticated;

-- ============================================================================
-- CONTRÔLE — celui qui manquait à 0120 : on ESSAIE l'abus.
-- ============================================================================
do $$
declare n integer; i integer;
begin
  delete from public.page_views where path = '/controle-0124';
  delete from public.agent_rate where cle = 'vuep:/controle-0124' or cle like 'vue:controle-0124-%';

  -- 200 appels sur la MÊME fiche avec 200 sessions différentes : exactement ce
  -- que 0120 laissait passer. `now()` est figé dans la transaction, les 200
  -- appels tombent donc dans la même minute — le compte est déterministe.
  set local role anon;
  set local statement_timeout = '60s';
  for i in 1..200 loop
    perform public.noter_vue('/controle-0124', null, 'controle-0124-' || i);
  end loop;
  reset role;

  select count(*) into n from public.page_views where path = '/controle-0124';
  if n <> 120 then
    raise exception '0124 : le plafond par chemin ne tient pas — % ligne(s) écrite(s) pour 200 appels, 120 attendues', n;
  end if;

  delete from public.page_views where path = '/controle-0124';
  delete from public.agent_rate where cle = 'vuep:/controle-0124' or cle like 'vue:controle-0124-%';
end $$;
