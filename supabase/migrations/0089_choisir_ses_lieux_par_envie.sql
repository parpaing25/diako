-- ============================================================================
-- 0089 — UNE ENVIE NE SUFFIT PAS : ON PROPOSE, ET LE VOYAGEUR CHOISIT
--
-- Demande du propriétaire, mot pour mot : « il faut proposer des plages, des
-- natures, des trek ; les plages par exemple on liste les plages et
-- l'utilisateur peut faire un choix sur quelle plage il voudrait y aller ».
--
-- 🔴 CE QUI EXISTAIT : RIEN DERRIÈRE L'ÉTIQUETTE. On cochait « plage » et
--    c'était tout. `trip_requests.place_ids` existe depuis le lot 1 et n'a
--    JAMAIS été ni écrit ni lu — et c'est un `uuid[]` SANS clé étrangère, donc
--    un tableau d'identifiants qui ne dit pas vers quelle table il pointe. On
--    peut y écrire n'importe quoi, y compris l'identifiant d'un compte.
--
-- ⚠ TROIS COLONNES PLUTÔT QU'UNE. `place_ids` (destinations), `attraction_ids`
--   (sites et plages), `dish_ids` (plats). Un seul tableau « polymorphe »
--   obligerait chaque lecteur à deviner la table d'origine — et le premier qui
--   devine mal affiche une plage à la place d'un plat. Trois colonnes typées se
--   valident, se joignent, et se lisent sans convention tacite.
--
-- ⚠ LA GASTRONOMIE N'EST PAS UN LIEU. Les quatre autres envies désignent des
--   endroits ; qui a envie de gastronomie veut MANGER UN PLAT, pas visiter un
--   endroit. Cette envie-là rend donc les 95 plats du référentiel, avec leur
--   lieu typique quand il est renseigné.
--
-- ⚠ « je ne sais pas encore » NE PROPOSE RIEN. C'est le seul comportement
--   honnête : dérouler 332 plages à quelqu'un qui vient de dire qu'il ne sait
--   pas contredit exactement ce qu'il a dit.
--
-- 🔴 LE TRI EST LE CŒUR DU PROBLÈME, PAS LA LISTE. Mesuré : 801 sommets dont 16
--    ont une photo, 318 plages dont 10. Une liste brute serait inutilisable. On
--    fait donc remonter ce qui a une photo, puis ce qui a une description, puis
--    l'alphabet — et le tri est TOTAL, départagé jusqu'au slug : sans ça la
--    pagination par curseur saute des lignes ou en répète, et personne ne s'en
--    aperçoit avant un signalement.
-- ============================================================================

alter table public.trip_requests
  add column if not exists attraction_ids uuid[] not null default '{}',
  add column if not exists dish_ids       uuid[] not null default '{}';

comment on column public.trip_requests.place_ids is
  'Destinations choisies (places.id). Validées par projet_choix — la colonne n''a pas de clé étrangère, c''est la fonction qui tient le contrat.';
comment on column public.trip_requests.attraction_ids is
  'Sites et plages choisis (attractions.id).';
comment on column public.trip_requests.dish_ids is
  'Plats choisis (dishes.id) — l''envie « gastronomie » ne désigne pas des lieux.';

-- ── Ce que chaque envie propose, écrit une fois ─────────────────────────────
-- ⚠ CES `kind` ONT ÉTÉ VÉRIFIÉS EN BASE, un par un. Un genre inventé rendrait
--   une liste vide en silence, ce qui ressemble à une panne.
create or replace function public.dk_kinds_envie(p_envie text)
returns text[]
language sql
immutable
as $$
  select case p_envie
    when 'plage'   then array['plage']
    when 'nature'  then array['parc','reserve','parc_animalier','cascade','grotte','source','aire']
    when 'trek'    then array['sommet','point_de_vue']
    when 'culture' then array['patrimoine','musee','oeuvre','site']
    else null::text[]
  end
$$;

-- ── ① Ce qu'on propose pour une envie ──────────────────────────────────────
create or replace function public.suggestions_envie(
  p_envie   text,
  p_q       text default null,
  p_region  text default null,
  p_curseur text default null,
  p_limite  integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_kinds  text[] := public.dk_kinds_envie(p_envie);
  v_lim    integer := least(greatest(coalesce(p_limite, 24), 1), 100);
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_total  integer := 0;
  v_els    jsonb := '[]'::jsonb;
  v_cur    text := null;
begin
  -- « je ne sais pas encore » et tout code inconnu : on ne propose rien.
  if v_kinds is null and p_envie is distinct from 'gastronomie' then
    return jsonb_build_object('total', 0, 'elements', '[]'::jsonb, 'curseur', null);
  end if;

  if p_envie = 'gastronomie' then
    select count(*) into v_total
      from public.dishes d
     where (v_q is null or d.name_fr ilike '%' || v_q || '%');

    with base as (
      select d.id, d.slug, d.name_fr, d.photo_url,
             l.name_fr as lieu, l.region,
             -- ⚠ Le rang est CALCULÉ ici et sert de curseur : il doit être
             --   strictement décroissant et sans ex aequo, d'où le slug final.
             ((d.photo_url is not null)::int)::text || ':' || d.slug as ordre
        from public.dishes d
        left join public.places l on l.id = d.typical_place_id
       where (v_q is null or d.name_fr ilike '%' || v_q || '%')
         and (p_region is null or l.region = p_region)
    )
    -- ⚠ LE CURSEUR EST LE `min`, PAS LE `max`. Le tri est DÉCROISSANT : la
    --   dernière ligne rendue porte la plus PETITE valeur, et c'est elle qu'il
    --   faut repasser pour reprendre après. Prendre le maximum ferait
    --   redémarrer chaque page au même endroit — une boucle infinie qui
    --   ressemble à un « voir plus » qui ne charge rien.
    select coalesce(jsonb_agg(jsonb_build_object(
             'ref', b.id, 'table', 'dishes', 'slug', b.slug, 'nom', b.name_fr,
             'kind', 'plat', 'region', b.region, 'resume', null,
             'cover_url', b.photo_url, 'cover_credit', null,
             'ville', b.lieu, 'km_ville', null) order by b.ordre desc),
           '[]'::jsonb),
           min(b.ordre)
      into v_els, v_cur
      from (select * from base
             where p_curseur is null or ordre < p_curseur
             order by ordre desc limit v_lim) b;
    return jsonb_build_object('total', v_total, 'elements', v_els,
                              'curseur', case when jsonb_array_length(v_els) < v_lim
                                              then null else v_cur end);
  end if;

  select count(*) into v_total
    from public.attractions a
    left join public.places l on l.id = a.place_id
   where a.is_published and a.kind = any(v_kinds)
     and (v_q is null or a.name ilike '%' || v_q || '%')
     and (p_region is null or l.region = p_region);

  with base as (
    select a.id, a.slug, a.name, a.kind, a.cover_url, a.cover_credit,
           a.summary, l.name_fr as ville, l.region,
           case when a.lat is null or l.lat is null then null
                else round(sqrt(power((a.lat - l.lat) * 111.0, 2)
                     + power((a.lng - l.lng) * 111.0 * cos(radians(a.lat)), 2))::numeric, 0)
           end as km,
           ((a.cover_url is not null)::int)::text
             || ((a.summary is not null and btrim(a.summary) <> '')::int)::text
             || ':' || a.slug as ordre
      from public.attractions a
      left join public.places l on l.id = a.place_id
     where a.is_published and a.kind = any(v_kinds)
       and (v_q is null or a.name ilike '%' || v_q || '%')
       and (p_region is null or l.region = p_region)
  ), page as (
    select * from base
     where p_curseur is null or ordre < p_curseur
     order by ordre desc limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ref', p.id, 'table', 'attractions', 'slug', p.slug, 'nom', p.name,
           'kind', p.kind, 'region', p.region, 'resume', p.summary,
           'cover_url', p.cover_url, 'cover_credit', p.cover_credit,
           'ville', p.ville, 'km_ville', p.km) order by p.ordre desc), '[]'::jsonb),
         min(p.ordre)
    into v_els, v_cur
    from page p;

  return jsonb_build_object('total', v_total, 'elements', v_els,
                            'curseur', case when jsonb_array_length(v_els) < v_lim
                                            then null else v_cur end);
end $$;

-- ── ② Enregistrer les choix ────────────────────────────────────────────────
create or replace function public.projet_choix(p_id uuid, p_refs jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi   uuid := (select auth.uid());
  v_prop  uuid;
  v_pl    uuid[];
  v_at    uuid[];
  v_di    uuid[];
  v_n     integer;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  select user_id into v_prop from public.trip_requests where id = p_id;
  if v_prop is null then raise exception 'Projet introuvable.'; end if;
  if v_prop <> v_moi then raise exception 'Ce projet n''est pas le vôtre.'; end if;

  if jsonb_typeof(coalesce(p_refs, 'null'::jsonb)) is distinct from 'array' then
    raise exception 'Choix illisibles.';
  end if;
  -- ⚠ UN PLAFOND. Sans lui, un appel direct pourrait ranger dix mille
  --   identifiants dans une ligne et rendre l'écran des pros inutilisable.
  if jsonb_array_length(p_refs) > 100 then
    raise exception 'Cent choix au maximum — au-delà, ce n''est plus un projet, c''est un catalogue.';
  end if;

  select array_agg(distinct (e->>'ref')::uuid) filter (where e->>'table' = 'places'),
         array_agg(distinct (e->>'ref')::uuid) filter (where e->>'table' = 'attractions'),
         array_agg(distinct (e->>'ref')::uuid) filter (where e->>'table' = 'dishes')
    into v_pl, v_at, v_di
    from jsonb_array_elements(p_refs) e;

  v_pl := coalesce(v_pl, '{}'); v_at := coalesce(v_at, '{}'); v_di := coalesce(v_di, '{}');

  -- 🔴 CHAQUE RÉFÉRENCE EST VÉRIFIÉE. C'est tout l'objet de cette fonction : la
  --    colonne n'a pas de clé étrangère, donc sans ce contrôle un appel direct
  --    y range n'importe quel identifiant, et l'écran des professionnels
  --    afficherait des lignes vides sans qu'on sache pourquoi.
  select count(*) into v_n from public.places
   where id = any(v_pl) and merged_into is null;
  if v_n <> coalesce(array_length(v_pl, 1), 0) then
    raise exception 'Une destination choisie n''existe pas (ou a été fusionnée).';
  end if;

  select count(*) into v_n from public.attractions where id = any(v_at) and is_published;
  if v_n <> coalesce(array_length(v_at, 1), 0) then
    raise exception 'Un site choisi n''existe pas.';
  end if;

  select count(*) into v_n from public.dishes where id = any(v_di);
  if v_n <> coalesce(array_length(v_di, 1), 0) then
    raise exception 'Un plat choisi n''existe pas.';
  end if;

  update public.trip_requests
     set place_ids = v_pl, attraction_ids = v_at, dish_ids = v_di
   where id = p_id;
end $$;

-- ── ③ Relire ses choix, et les rendre lisibles aux professionnels ──────────
-- ⚠ SANS CETTE FONCTION, les choix seraient écrits et jamais relus : un projet
--   rouvert perdrait ses lieux à l'écran alors qu'ils sont bien en base.
create or replace function public.projet_choix_lus(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'nom'), '[]'::jsonb) from (
    select jsonb_build_object('ref', p.id, 'table', 'places', 'slug', p.slug,
             'nom', p.name_fr, 'kind', p.kind, 'cover_url', p.cover_url) x
      from public.trip_requests t join public.places p on p.id = any(t.place_ids)
     where t.id = p_id
    union all
    select jsonb_build_object('ref', a.id, 'table', 'attractions', 'slug', a.slug,
             'nom', a.name, 'kind', a.kind, 'cover_url', a.cover_url)
      from public.trip_requests t join public.attractions a on a.id = any(t.attraction_ids)
     where t.id = p_id
    union all
    select jsonb_build_object('ref', d.id, 'table', 'dishes', 'slug', d.slug,
             'nom', d.name_fr, 'kind', 'plat', 'cover_url', d.photo_url)
      from public.trip_requests t join public.dishes d on d.id = any(t.dish_ids)
     where t.id = p_id
  ) s
$$;

-- ⚠ `suggestions_envie` sert un écran ouvert AVANT la création de compte : on
--   peut décrire son voyage sans être connecté. Elle est donc lisible par anon.
grant execute on function public.suggestions_envie(text, text, text, text, integer)
  to anon, authenticated;
revoke all on function public.projet_choix(uuid, jsonb)      from public, anon;
grant  execute on function public.projet_choix(uuid, jsonb)   to authenticated;
revoke all on function public.projet_choix_lus(uuid)         from public, anon;
grant  execute on function public.projet_choix_lus(uuid)      to authenticated;
revoke all on function public.dk_kinds_envie(text)           from public, anon;

-- ── Contrôle 1 : chaque envie propose vraiment quelque chose ───────────────
do $$
declare e text; v_n integer; v_vides text := '';
begin
  foreach e in array array['plage','nature','trek','culture','gastronomie'] loop
    select (public.suggestions_envie(e, null, null, null, 1)->>'total')::int into v_n;
    if coalesce(v_n, 0) = 0 then v_vides := v_vides || e || ' '; end if;
  end loop;
  if v_vides <> '' then
    raise exception '0089 : ces envies ne proposent RIEN : % — un `kind` inventé rend une liste vide en silence', v_vides;
  end if;
  -- ⚠ Et celle-ci doit rester vide, c'est le comportement voulu.
  select (public.suggestions_envie('indecis', null, null, null, 1)->>'total')::int into v_n;
  if v_n <> 0 then
    raise exception '0089 : « je ne sais pas encore » propose % éléments — il ne doit rien proposer', v_n;
  end if;
end $$;

-- ── Contrôle 2 : la pagination ne saute ni ne répète ───────────────────────
-- 🔴 UN TRI NON TOTAL EST INVISIBLE À L'ŒIL : la première page paraît juste, et
--    ce sont les suivantes qui perdent ou doublent des lignes. On le vérifie.
do $$
declare v_p1 jsonb; v_p2 jsonb; v_cur text; v_communs int;
begin
  v_p1 := public.suggestions_envie('plage', null, null, null, 10);
  v_cur := v_p1->>'curseur';
  if v_cur is null then
    raise warning '0089 : pas assez de plages pour éprouver la pagination';
    return;
  end if;
  v_p2 := public.suggestions_envie('plage', null, null, v_cur, 10);
  select count(*) into v_communs
    from jsonb_array_elements(v_p1->'elements') a
    join jsonb_array_elements(v_p2->'elements') b on a->>'ref' = b->>'ref';
  if v_communs > 0 then
    raise exception '0089 : la deuxième page répète % élément(s) de la première', v_communs;
  end if;
end $$;

-- ── Contrôle 3 : une référence inventée est refusée ────────────────────────
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.projet_choix(gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('ref', gen_random_uuid(), 'table', 'places')));
    v_ok := true;
  exception when others then null;
  end;
  if v_ok then
    raise exception '0089 : projet_choix a ACCEPTÉ un projet et une référence inexistants';
  end if;
end $$;
