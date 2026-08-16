-- ============================================================================
-- 0088 — EXPLORER DESCEND : PAYS › RÉGION › VILLE › DESTINATION
--
-- 🔴 CE QUE ÇA CORRIGE. Le catalogue déversait les 509 destinations en une
--    grille alphabétique unique. Chercher où aller dans le Nord voulait dire
--    faire défiler d'Ambalavao à Vohipeno en connaissant déjà les noms —
--    c'est-à-dire n'avoir plus besoin du catalogue.
--
-- 🔴 LE NIVEAU « VILLE » N'EXISTE PAS DANS LES DONNÉES, et c'est tout le
--    travail de cette migration. Mesuré avant d'écrire : sur les destinations
--    touristiques, 475 ont pour parent leur RÉGION et 17 seulement une ville.
--    `parent_id` ne décrit donc pas la géographie vécue, il décrit l'import.
--    Il y a par ailleurs 132 lignes `kind in ('ville','commune')` : la matière
--    est là, le lien manque.
--
-- ⚠ ON RATTACHE PAR LA GÉOGRAPHIE, ET ON L'ÉCRIT DANS UNE COLONNE. Calculer la
--   ville la plus proche à chaque appel ferait un produit cartésien de 509 × 132
--   à chaque ouverture d'écran. La colonne est posée une fois, indexée, et se
--   recalcule par une fonction qu'on peut rappeler après un import.
--
-- ⚠ SOIXANTE KILOMÈTRES, ET PAS PLUS. Au-delà, « près de » ne veut plus rien
--   dire à Madagascar : entre deux villes de l'Ouest il y a des journées de
--   piste. Ce qu'aucune ville n'accueille tombe dans « ailleurs », qui est
--   ASSUMÉ à l'écran et non caché — une destination qui n'apparaît nulle part
--   est perdue, et personne ne vient signaler ce qu'il ne voit pas.
--
-- ⚠ UNE VILLE EST SA PROPRE DESTINATION. Antsirabe est une ville ET un endroit
--   où l'on va : elle apparaît donc dans sa propre liste, à zéro kilomètre.
--   L'exclure ferait afficher « 3 destinations » sur une ville qui en compte
--   quatre avec elle-même, et l'arithmétique du contrôle final ne tomberait
--   plus juste.
--
-- ⚠ LES COMPTEURS SONT CALCULÉS, JAMAIS LUS DANS nb_pages/nb_posts. Ces
--   colonnes dénormalisées dérivent — le dépôt le documente en plusieurs
--   endroits, et 0087 vient encore de les recalculer après les fusions.
-- ============================================================================

-- ── D'abord, sortir le pays du catalogue des destinations ──────────────────
-- 🔴 TROUVÉ PAR L'ASSERTION DE CETTE MIGRATION, qui annonçait « 508 sur 509 ».
--    La ligne `madagascar` (`kind = 'pays'`, région nulle) portait
--    `is_touristique = true` : elle comptait dans le catalogue sans pouvoir
--    apparaître sous aucune région — puisqu'elle les contient toutes. Elle
--    gonflait le total de 1 et n'était affichable nulle part.
-- ⚠ Ce n'est pas une correction cosmétique du compteur : Madagascar n'est pas
--   une destination À L'INTÉRIEUR de Madagascar. La ligne reste, elle sert de
--   racine à l'arbre des lieux ; elle cesse simplement d'être une destination.
update public.places set is_touristique = false where kind = 'pays';

alter table public.places add column if not exists ville_proche_id uuid
  references public.places(id) on delete set null;

create index if not exists places_ville_proche_idx
  on public.places (ville_proche_id) where merged_into is null;
create index if not exists places_region_touristique_idx
  on public.places (region) where merged_into is null and is_touristique;

-- ── Le rattachement, dans une fonction qu'on peut rappeler ──────────────────
-- ⚠ APRÈS TOUT IMPORT ou toute fusion, rappeler `select public.dk_rattacher_villes();`
--   Sans ça, une destination ajoutée demain n'apparaîtrait sous aucune ville.
create or replace function public.dk_rattacher_villes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  update public.places d set ville_proche_id = null
   where d.merged_into is null and d.is_touristique;

  -- Une ville touristique est sa propre entrée de deuxième niveau.
  update public.places d set ville_proche_id = d.id
   where d.merged_into is null and d.is_touristique
     and d.kind in ('ville', 'commune');

  -- Les autres cherchent la ville la plus proche DANS LEUR RÉGION.
  --
  -- ⚠ LE `LATERAL` VIT DANS UNE CTE, PAS DANS LE `FROM` DE L'UPDATE.
  --   PostgreSQL refuse qu'une sous-requête latérale du `from` référence la
  --   table CIBLE de l'update : « invalid reference to FROM-clause entry for
  --   table "d" » (42P10). La cible n'est pas encore une entrée de portée à cet
  --   endroit. On calcule donc le rattachement dans un `with`, sur un simple
  --   `select`, puis on l'applique.
  with cible as (
    select d.id as destination, v.id as ville
      from public.places d
      cross join lateral (
        select c.id,
               sqrt(power((d.lat - c.lat) * 111.0, 2)
                  + power((d.lng - c.lng) * 111.0 * cos(radians(d.lat)), 2)) km
          from public.places c
         where c.merged_into is null
           and c.kind in ('ville', 'commune')
           and c.region = d.region
           and c.lat is not null and c.lng is not null
         order by km, c.id
         limit 1
      ) v
     where d.merged_into is null and d.is_touristique
       and d.ville_proche_id is null
       and d.lat is not null and d.lng is not null
       and d.region is not null
       and v.km <= 60
  )
  update public.places p set ville_proche_id = cible.ville
    from cible where p.id = cible.destination;

  select count(*) into v_n from public.places
   where merged_into is null and is_touristique and ville_proche_id is not null;
  return v_n;
end $$;

select public.dk_rattacher_villes();

revoke all on function public.dk_rattacher_villes() from public, anon, authenticated;

-- ── ① Les régions ──────────────────────────────────────────────────────────
create or replace function public.explorer_regions()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'nom'), '[]'::jsonb) from (
    select jsonb_build_object(
      'slug', r.slug,
      'nom', r.name_fr,
      'nb_destinations', (select count(*) from public.places d
                           where d.merged_into is null and d.is_touristique
                             and d.region = r.name_fr),
      'nb_etablissements', (select count(*) from public.pages g
                             join public.places d on d.id = g.place_id
                            where g.is_published and d.merged_into is null
                              and d.region = r.name_fr),
      -- ⚠ CHOIX DÉTERMINISTE : la destination la mieux dotée qui a une photo,
      --   départagée par le slug. Un `order by random()` ferait changer la
      --   vignette à chaque chargement, et personne ne reconnaîtrait sa région.
      'cover_url', c.cover_url,
      'cover_credit', c.cover_credit
    ) x
    from public.places r
    left join lateral (
      select d.cover_url, d.cover_credit
        from public.places d
       where d.merged_into is null and d.is_touristique
         and d.region = r.name_fr and d.cover_url is not null
       order by d.nb_pages desc, d.slug
       limit 1
    ) c on true
    where r.kind = 'region' and r.merged_into is null
  ) s
$$;

-- ── ② Une région : ses villes, et ce qu'aucune ville n'accueille ───────────
create or replace function public.explorer_region(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with r as (
    select id, slug, name_fr from public.places
     where kind = 'region' and merged_into is null and slug = p_slug
  ),
  dest as (
    select d.* from public.places d, r
     where d.merged_into is null and d.is_touristique and d.region = r.name_fr
  )
  select case when (select count(*) from r) = 0 then null else jsonb_build_object(
    'region', jsonb_build_object(
      'slug', (select slug from r),
      'nom', (select name_fr from r),
      'nb_destinations', (select count(*) from dest)),
    'villes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', v.slug, 'nom', v.name_fr, 'kind', v.kind,
               'summary', v.summary,
               'cover_url', v.cover_url, 'cover_credit', v.cover_credit,
               'nb_destinations', (select count(*) from dest d where d.ville_proche_id = v.id),
               'nb_etablissements', (select count(*) from public.pages g
                                      join dest d on d.id = g.place_id
                                     where g.is_published and d.ville_proche_id = v.id),
               'nb_recits', (select count(*) from public.posts o
                              join dest d on d.id = o.place_id
                             where o.status = 'published' and d.ville_proche_id = v.id))
             order by (select count(*) from dest d where d.ville_proche_id = v.id) desc,
                      v.name_fr)
        from public.places v
       where v.id in (select distinct ville_proche_id from dest where ville_proche_id is not null)
    ), '[]'::jsonb),
    -- ⚠ « Ailleurs » EST VISIBLE, pas caché : ce sont des destinations réelles
    --   qu'aucune ville n'accueille à moins de soixante kilomètres.
    'ailleurs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', d.slug, 'nom', d.name_fr, 'kind', d.kind,
               'summary', d.summary,
               'cover_url', d.cover_url, 'cover_credit', d.cover_credit,
               'nb_etablissements', (select count(*) from public.pages g
                                      where g.is_published and g.place_id = d.id),
               'nb_recits', (select count(*) from public.posts o
                              where o.status = 'published' and o.place_id = d.id))
             order by d.name_fr)
        from dest d where d.ville_proche_id is null
    ), '[]'::jsonb)
  ) end
$$;

-- ── ③ Une ville : ce qu'il y a autour ──────────────────────────────────────
create or replace function public.explorer_ville(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with v as (
    select id, slug, name_fr, region, summary, cover_url, cover_credit, lat, lng
      from public.places
     where merged_into is null and slug = p_slug
  )
  select case when (select count(*) from v) = 0 then null else jsonb_build_object(
    'ville', (select jsonb_build_object(
                'slug', slug, 'nom', name_fr, 'region', region, 'summary', summary,
                'cover_url', cover_url, 'cover_credit', cover_credit) from v),
    'destinations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', d.slug, 'nom', d.name_fr, 'kind', d.kind,
               'summary', d.summary,
               'cover_url', d.cover_url, 'cover_credit', d.cover_credit,
               -- ⚠ NULL et non 0 quand une coordonnée manque : « à 0 km »
               --   voudrait dire « sur place », ce qui serait faux.
               'km', case when d.lat is null or (select lat from v) is null then null
                          else round(sqrt(
                            power((d.lat - (select lat from v)) * 111.0, 2)
                          + power((d.lng - (select lng from v)) * 111.0
                                  * cos(radians(d.lat)), 2))::numeric, 0) end,
               'nb_etablissements', (select count(*) from public.pages g
                                      where g.is_published and g.place_id = d.id),
               'nb_recits', (select count(*) from public.posts o
                              where o.status = 'published' and o.place_id = d.id))
             order by (d.id = (select id from v)) desc, d.cover_url is null, d.name_fr)
        from public.places d
       where d.merged_into is null and d.is_touristique
         and d.ville_proche_id = (select id from v)
    ), '[]'::jsonb)
  ) end
$$;

grant execute on function public.explorer_regions()      to anon, authenticated;
grant execute on function public.explorer_region(text)   to anon, authenticated;
grant execute on function public.explorer_ville(text)    to anon, authenticated;

-- ── Contrôle 1 : AUCUNE DESTINATION NE SE PERD, AUCUNE NE COMPTE DEUX FOIS ──
-- 🔴 C'est LE contrôle de cette migration. Un rattachement qui oublie un lieu
--    le rend inatteignable en silence : il n'est ni sous une ville, ni dans
--    « ailleurs », et rien à l'écran ne le signale.
do $$
declare v_total integer; v_vu integer;
begin
  select count(*) into v_total from public.places
   where merged_into is null and is_touristique;

  select coalesce(sum(n), 0) into v_vu from (
    select (jsonb_array_length(r->'ailleurs'))
         + coalesce((select sum((v->>'nb_destinations')::int)
                       from jsonb_array_elements(r->'villes') v), 0) n
      from public.places g
      cross join lateral (select public.explorer_region(g.slug) r) x
     where g.kind = 'region' and g.merged_into is null and x.r is not null
  ) s;

  if v_vu <> v_total then
    raise exception
      '0088 : la descente montre % destinations sur % — un lieu se perd ou se compte deux fois',
      v_vu, v_total;
  end if;
end $$;

-- ── Contrôle 2 : la lecture publique fonctionne ────────────────────────────
do $$
begin
  if not has_function_privilege('anon', 'public.explorer_regions()', 'execute')
     or not has_function_privilege('anon', 'public.explorer_region(text)', 'execute')
     or not has_function_privilege('anon', 'public.explorer_ville(text)', 'execute') then
    raise exception '0088 : anon ne peut pas lire la descente — /explorer rendrait 42501';
  end if;
  if has_function_privilege('anon', 'public.dk_rattacher_villes()', 'execute') then
    raise exception '0088 : anon peut lancer le rattachement — c''est une écriture';
  end if;
end $$;
