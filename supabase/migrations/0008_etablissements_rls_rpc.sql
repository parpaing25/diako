-- ============================================================================
-- 0008 — ÉTABLISSEMENTS : RLS, DÉCLENCHEURS, RPC
--
-- Suite de 0007, qui ne posait que les tables. Ici se joue ce qui décide si le
-- modèle est utilisable ou dangereux :
--   · qui a le droit de lire et d'écrire quoi (RLS) ;
--   · ce que la base recalcule toute seule (prix plancher, note, compteurs) ;
--   · les quatre appels que le site utilisera réellement.
--
-- ⚠ Un défaut corrigé en cours de route est conservé en commentaire dans la
--   section 2 : il est trop facile à refaire.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. AIDES
--
-- SECURITY DEFINER délibérément : elles court-circuitent la RLS de `pages`,
-- ce qui évite une récursion infinie quand la policy d'une table fille doit
-- interroger la table mère pour savoir si elle a le droit de répondre.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.page_publiee(p uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.pages where id = p and is_published) $$;

create or replace function public.page_a_moi(p uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.pages where id = p and owner_id = (select auth.uid())) $$;

create or replace function public.page_du_circuit(t uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select page_id from public.tours where id = t $$;

create or replace function public.page_de_la_chambre(r uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select page_id from public.room_types where id = r $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PRIX PLANCHER, NOTE ET COMPTEURS
--
-- price_min_ar est LA colonne qui rend le filtre budget possible. Sans elle il
-- faudrait joindre trois tables d'offres à chaque requête de liste, et
-- « un hôtel à moins de 120 000 Ar la nuit à Majunga » resterait hors de portée.
--
-- ⚠⚠ PIÈGE PL/pgSQL, corrigé après échec réel en base. La première version
--    écrivait :
--        v_page := case tg_table_name
--                    when 'season_rates' then ...new.room_type_id...
--                    when 'tour_prices'  then ...new.tour_id...
--                    else new.page_id end;
--    PL/pgSQL compile l'expression ENTIÈRE en une seule requête : les trois
--    branches sont analysées même si une seule sera prise. Sur une insertion
--    dans room_types — qui n'a pas de colonne room_type_id — la fonction
--    échouait avec « record "new" has no field "room_type_id" », et TOUTE
--    création de chambre était impossible.
--    Des IF/ELSIF séparent les expressions : seule la branche atteinte est
--    évaluée. Même précaution pour le retour, qui ne doit pas être
--    coalesce(new, old) mais un choix explicite selon TG_OP.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.maj_prix_page(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prix bigint; v_unite text; v_maj timestamptz;
begin
  -- Priorité au tarif saisonnier réel plutôt qu'au prix affiché sur la chambre :
  -- un hôtel qui a saisi « basse saison 85 000 » doit ressortir à 85 000, pas
  -- à son tarif de référence.
  select least(
           (select min(sr.price_ar) from public.season_rates sr
              join public.room_types rt on rt.id = sr.room_type_id
             where rt.page_id = p and rt.status = 'actif'),
           (select min(rt.base_price_ar) from public.room_types rt
             where rt.page_id = p and rt.status = 'actif')
         ),
         (select max(sr.checked_at) from public.season_rates sr
            join public.room_types rt on rt.id = sr.room_type_id where rt.page_id = p)
    into v_prix, v_maj;

  if v_prix is not null then
    v_unite := 'nuit';
  else
    select min(price_ar) into v_prix from public.menu_items
      where page_id = p and price_ar is not null and in_stock;
    if v_prix is not null then
      v_unite := 'plat';
    else
      select min(price_ar) into v_prix from public.activities
        where page_id = p and price_ar is not null;
      if v_prix is not null then
        v_unite := 'personne';
      else
        select min(tp.price_ar) into v_prix from public.tour_prices tp
          join public.tours t on t.id = tp.tour_id where t.page_id = p;
        if v_prix is not null then v_unite := 'personne'; end if;
      end if;
    end if;
  end if;

  update public.pages
     set price_min_ar = v_prix,
         price_min_unit = v_unite,
         rates_checked_at = coalesce(v_maj, rates_checked_at)
   where id = p
     and (price_min_ar is distinct from v_prix or price_min_unit is distinct from v_unite);
end $$;

create or replace function public.trg_maj_prix()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_page uuid; v_ref uuid;
begin
  if tg_table_name = 'season_rates' then
    if tg_op = 'DELETE' then v_ref := old.room_type_id; else v_ref := new.room_type_id; end if;
    v_page := public.page_de_la_chambre(v_ref);
  elsif tg_table_name = 'tour_prices' then
    if tg_op = 'DELETE' then v_ref := old.tour_id; else v_ref := new.tour_id; end if;
    v_page := public.page_du_circuit(v_ref);
  else
    if tg_op = 'DELETE' then v_page := old.page_id; else v_page := new.page_id; end if;
  end if;

  if v_page is not null then perform public.maj_prix_page(v_page); end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- Colonnes à valeur commerciale : un propriétaire ne doit pas pouvoir se
-- déclarer « vérifié » ni s'attribuer une note. La leçon vient du projet frère,
-- où le même oubli aurait laissé n'importe qui se décerner un badge.
create or replace function public.pages_avant_ecriture()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_score smallint := 0;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;
    new.views_count  := old.views_count;
  elsif tg_op = 'INSERT' and not public.is_admin() then
    new.verification_status := 'none';
    new.rating_avg := 0; new.rating_count := 0; new.views_count := 0;
  end if;

  -- La complétude pilote le classement : une fiche renseignée passe devant une
  -- fiche vide, ce qui est la seule incitation honnête à bien remplir.
  if coalesce(length(new.short_desc), 0) > 20 then v_score := v_score + 10; end if;
  if coalesce(length(new.long_desc), 0)  > 80 then v_score := v_score + 10; end if;
  if new.place_id  is not null then v_score := v_score + 15; end if;
  if new.cover_url is not null then v_score := v_score + 15; end if;
  if coalesce(new.phone, new.whatsapp) is not null then v_score := v_score + 15; end if;
  if jsonb_array_length(coalesce(new.gallery, '[]'::jsonb)) >= 3 then v_score := v_score + 10; end if;
  if tg_op = 'UPDATE' and (
       exists (select 1 from public.room_types where page_id = new.id)
    or exists (select 1 from public.menu_items where page_id = new.id)
    or exists (select 1 from public.activities where page_id = new.id)
    or exists (select 1 from public.tours      where page_id = new.id)
  ) then v_score := v_score + 25; end if;

  new.completeness := v_score;
  return new;
end $$;

create or replace function public.maj_note_page()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_page uuid;
begin
  if tg_op = 'DELETE' then v_page := old.page_id; else v_page := new.page_id; end if;
  update public.pages p
     set rating_avg = coalesce(r.moy, 0), rating_count = coalesce(r.n, 0)
    from (select round(avg(note)::numeric, 1) as moy, count(*) as n
            from public.reviews where page_id = v_page and status = 'published') r
   where p.id = v_page;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- Compteurs dénormalisés des référentiels : « 8 restaurants servent ce plat »,
-- « 12 établissements à Nosy Be ». On recalcule aussi l'ANCIENNE valeur lors
-- d'un déplacement, sinon le compteur du lieu quitté reste faux pour toujours.
create or replace function public.maj_compteurs_referentiels()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_place uuid; v_dish uuid;
begin
  if tg_table_name = 'pages' then
    if tg_op = 'DELETE' then v_place := old.place_id; else v_place := new.place_id; end if;
    if tg_op = 'UPDATE' and old.place_id is distinct from new.place_id then
      update public.places pl set nb_pages = (
        select count(*) from public.pages where place_id = pl.id and is_published)
       where pl.id = old.place_id;
    end if;
    if v_place is not null then
      update public.places pl set nb_pages = (
        select count(*) from public.pages where place_id = pl.id and is_published)
       where pl.id = v_place;
    end if;
  else
    if tg_op = 'DELETE' then v_dish := old.dish_id; else v_dish := new.dish_id; end if;
    if tg_op = 'UPDATE' and old.dish_id is distinct from new.dish_id and old.dish_id is not null then
      update public.dishes d set nb_restaurants = (
        select count(distinct page_id) from public.menu_items where dish_id = d.id and in_stock)
       where d.id = old.dish_id;
    end if;
    if v_dish is not null then
      update public.dishes d set nb_restaurants = (
        select count(distinct page_id) from public.menu_items where dish_id = d.id and in_stock)
       where d.id = v_dish;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists trg_pages_avant on public.pages;
create trigger trg_pages_avant before insert or update on public.pages
  for each row execute function public.pages_avant_ecriture();

drop trigger if exists trg_pages_compteur on public.pages;
create trigger trg_pages_compteur after insert or update or delete on public.pages
  for each row execute function public.maj_compteurs_referentiels();

drop trigger if exists trg_menu_compteur on public.menu_items;
create trigger trg_menu_compteur after insert or update or delete on public.menu_items
  for each row execute function public.maj_compteurs_referentiels();

drop trigger if exists trg_avis_note on public.reviews;
create trigger trg_avis_note after insert or update or delete on public.reviews
  for each row execute function public.maj_note_page();

do $$
declare t text;
begin
  foreach t in array array['room_types','season_rates','menu_items','activities','tour_prices'] loop
    execute format('drop trigger if exists trg_prix_%I on public.%I', t, t);
    execute format(
      'create trigger trg_prix_%I after insert or update or delete on public.%I
         for each row execute function public.trg_maj_prix()', t, t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pages           enable row level security;
alter table public.page_amenities  enable row level security;
alter table public.page_hours      enable row level security;
alter table public.room_types      enable row level security;
alter table public.season_rates    enable row level security;
alter table public.menu_sections   enable row level security;
alter table public.menu_items      enable row level security;
alter table public.menu_photos     enable row level security;
alter table public.activities      enable row level security;
alter table public.tours           enable row level security;
alter table public.tour_days       enable row level security;
alter table public.tour_prices     enable row level security;
alter table public.tour_inclusions enable row level security;
alter table public.reviews         enable row level security;
alter table public.review_replies  enable row level security;
alter table public.post_mentions   enable row level security;

drop policy if exists pages_lecture on public.pages;
drop policy if exists pages_creer   on public.pages;
drop policy if exists pages_gerer   on public.pages;
create policy pages_lecture on public.pages for select
  using (is_published or owner_id = (select auth.uid()) or public.is_staff());
create policy pages_creer on public.pages for insert
  with check (owner_id = (select auth.uid()));
create policy pages_gerer on public.pages for update
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

-- Tables filles rattachées par page_id : même règle partout, écrite une fois.
do $$
declare t text;
begin
  foreach t in array array[
    'page_amenities','page_hours','room_types','menu_sections','menu_items',
    'menu_photos','activities','tours','review_replies'
  ] loop
    execute format('drop policy if exists %I_lecture on public.%I', t, t);
    execute format('drop policy if exists %I_gerer   on public.%I', t, t);
    execute format(
      'create policy %I_lecture on public.%I for select
         using (public.page_publiee(page_id) or public.page_a_moi(page_id))', t, t);
    execute format(
      'create policy %I_gerer on public.%I for all
         using (public.page_a_moi(page_id) or public.is_admin())
         with check (public.page_a_moi(page_id) or public.is_admin())', t, t);
  end loop;
end $$;

drop policy if exists season_rates_lecture on public.season_rates;
drop policy if exists season_rates_gerer   on public.season_rates;
create policy season_rates_lecture on public.season_rates for select
  using (public.page_publiee(public.page_de_la_chambre(room_type_id))
      or public.page_a_moi(public.page_de_la_chambre(room_type_id)));
create policy season_rates_gerer on public.season_rates for all
  using (public.page_a_moi(public.page_de_la_chambre(room_type_id)) or public.is_admin())
  with check (public.page_a_moi(public.page_de_la_chambre(room_type_id)) or public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['tour_days','tour_prices','tour_inclusions'] loop
    execute format('drop policy if exists %I_lecture on public.%I', t, t);
    execute format('drop policy if exists %I_gerer   on public.%I', t, t);
    execute format(
      'create policy %I_lecture on public.%I for select
         using (public.page_publiee(public.page_du_circuit(tour_id))
             or public.page_a_moi(public.page_du_circuit(tour_id)))', t, t);
    execute format(
      'create policy %I_gerer on public.%I for all
         using (public.page_a_moi(public.page_du_circuit(tour_id)) or public.is_admin())
         with check (public.page_a_moi(public.page_du_circuit(tour_id)) or public.is_admin())', t, t);
  end loop;
end $$;

-- Avis : tout le monde lit, l'auteur écrit le sien, et un établissement ne peut
-- NI se noter lui-même, NI modifier ou supprimer un avis qui le concerne. Sans
-- ces deux verrous, la note moyenne se manipule en trois clics.
drop policy if exists reviews_lecture   on public.reviews;
drop policy if exists reviews_creer     on public.reviews;
drop policy if exists reviews_gerer     on public.reviews;
drop policy if exists reviews_supprimer on public.reviews;
create policy reviews_lecture on public.reviews for select
  using (status = 'published' or author_id = (select auth.uid()) or public.is_staff());
create policy reviews_creer on public.reviews for insert
  with check (author_id = (select auth.uid()) and not public.page_a_moi(page_id));
create policy reviews_gerer on public.reviews for update
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy reviews_supprimer on public.reviews for delete
  using (author_id = (select auth.uid()) or public.is_admin());

drop policy if exists post_mentions_lecture on public.post_mentions;
drop policy if exists post_mentions_gerer   on public.post_mentions;
create policy post_mentions_lecture on public.post_mentions for select using (true);
create policy post_mentions_gerer on public.post_mentions for all
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- ────────────────────────────────────────────────────────────────────────────
-- 4. LES APPELS DU SITE
-- ────────────────────────────────────────────────────────────────────────────

-- Un lieu est une ZONE : chercher « Nosy Be » doit ramener aussi Ambatoloaka,
-- Andilana et Hell-Ville. Sans cette descente, un hôtel rangé sous un quartier
-- devient invisible depuis sa ville.
create or replace function public.lieu_et_descendants(p_place uuid)
returns table(id uuid) language sql stable security definer set search_path = public as $$
  with recursive arbre as (
    select p.id from public.places p where p.id = p_place
    union all
    select c.id from public.places c join arbre a on c.parent_id = a.id
  ) select arbre.id from arbre
$$;

-- La fiche complète en UN appel, pas huit : sur une 3G malgache, huit
-- allers-retours coûtent plus cher que la charge utile elle-même.
create or replace function public.get_page_by_slug(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'name', p.name, 'owner_id', p.owner_id,
    'categories', p.categories, 'subcategory', p.subcategory,
    'short_desc', p.short_desc, 'long_desc', p.long_desc,
    'address', p.address, 'landmark', p.landmark, 'lat', p.lat, 'lng', p.lng,
    'phone', p.phone, 'whatsapp', p.whatsapp, 'email', p.email,
    'website', p.website, 'facebook', p.facebook,
    'logo_url', p.logo_url, 'cover_url', p.cover_url, 'cover_offset_y', p.cover_offset_y,
    'gallery', p.gallery, 'languages', p.languages, 'payment_methods', p.payment_methods,
    'price_level', p.price_level, 'verification_status', p.verification_status,
    'rating_avg', p.rating_avg, 'rating_count', p.rating_count,
    'price_min_ar', p.price_min_ar, 'price_min_unit', p.price_min_unit,
    'rates_checked_at', p.rates_checked_at, 'completeness', p.completeness,
    'place', case when pl.id is null then null else
      jsonb_build_object('id', pl.id, 'slug', pl.slug, 'name', pl.name_fr, 'region', pl.region) end,
    'amenities', coalesce((
      select jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label_fr, 'category', a.category)
             order by a.rang)
        from public.page_amenities pa join public.amenities a on a.code = pa.code
       where pa.page_id = p.id), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('jour', h.jour, 'ouvre', h.ouvre, 'ferme', h.ferme,
                                          'ferme_journee', h.ferme_toute_la_journee) order by h.jour)
        from public.page_hours h where h.page_id = p.id), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'description', r.description, 'photos', r.photos,
               'units_count', r.units_count, 'max_adults', r.max_adults, 'max_children', r.max_children,
               'surface_m2', r.surface_m2, 'private_bath', r.private_bath, 'hot_water', r.hot_water,
               'view', r.view, 'base_price_ar', r.base_price_ar, 'price_unit', r.price_unit,
               'extra_person_ar', r.extra_person_ar, 'status', r.status,
               'rates', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id, 'season_label', s.season_label, 'from_date', s.from_date,
                          'to_date', s.to_date, 'price_ar', s.price_ar, 'price_unit', s.price_unit,
                          'board', s.board, 'min_nights', s.min_nights,
                          'resident_price_ar', s.resident_price_ar) order by s.from_date nulls first)
                   from public.season_rates s where s.room_type_id = r.id), '[]'::jsonb))
             order by r.sort_order, r.base_price_ar)
        from public.room_types r where r.page_id = p.id and r.status <> 'ferme'), '[]'::jsonb),
    'menu_sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'service', ms.service)
             order by ms.sort_order)
        from public.menu_sections ms where ms.page_id = p.id), '[]'::jsonb),
    'menu_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mi.id, 'section_id', mi.section_id, 'name', mi.name, 'dish_id', mi.dish_id,
               'dish_slug', d.slug, 'description', mi.description, 'price_ar', mi.price_ar,
               'price_unit', mi.price_unit, 'photo_url', mi.photo_url,
               'availability', mi.availability, 'tags', mi.tags, 'side_dish', mi.side_dish,
               'is_signature', mi.is_signature, 'in_stock', mi.in_stock)
             order by mi.sort_order, mi.name)
        from public.menu_items mi left join public.dishes d on d.id = mi.dish_id
       where mi.page_id = p.id), '[]'::jsonb),
    'menu_photos', coalesce((
      select jsonb_agg(jsonb_build_object('url', mp.url, 'legende', mp.legende) order by mp.sort_order)
        from public.menu_photos mp where mp.page_id = p.id), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ac.id, 'name', ac.name, 'description', ac.description, 'photos', ac.photos,
               'duration_h', ac.duration_h, 'price_ar', ac.price_ar, 'price_unit', ac.price_unit,
               'min_people', ac.min_people, 'max_people', ac.max_people, 'includes', ac.includes)
             order by ac.sort_order)
        from public.activities ac where ac.page_id = p.id), '[]'::jsonb),
    'tours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'slug', t.slug, 'title', t.title, 'summary', t.summary,
               'description', t.description, 'duration_days', t.duration_days,
               'duration_nights', t.duration_nights, 'difficulty', t.difficulty,
               'format', t.format, 'group_min', t.group_min, 'group_max', t.group_max,
               'axe', t.axe, 'transports', t.transports, 'guide_langs', t.guide_langs,
               'parks_included', t.parks_included, 'months_open', t.months_open, 'photos', t.photos,
               'days', coalesce((
                 select jsonb_agg(jsonb_build_object('jour', td.jour, 'titre', td.titre,
                          'detail', td.detail, 'nuitee', td.nuitee) order by td.jour)
                   from public.tour_days td where td.tour_id = t.id), '[]'::jsonb),
               'prices', coalesce((
                 select jsonb_agg(jsonb_build_object('base_pax', tp.base_pax, 'price_ar', tp.price_ar,
                          'price_unit', tp.price_unit) order by tp.base_pax)
                   from public.tour_prices tp where tp.tour_id = t.id), '[]'::jsonb),
               'inclusions', coalesce((
                 select jsonb_agg(jsonb_build_object('libelle', ti.libelle, 'inclus', ti.inclus)
                          order by ti.inclus desc, ti.sort_order)
                   from public.tour_inclusions ti where ti.tour_id = t.id), '[]'::jsonb))
             order by t.duration_days)
        from public.tours t where t.page_id = p.id), '[]'::jsonb)
  ) end
  from public.pages p
  left join public.places pl on pl.id = p.place_id
  where p.slug = p_slug
    and (p.is_published or p.owner_id = (select auth.uid()))
$$;

-- Écrire à un établissement.
--
-- ⚠ On NE casse PAS `check (a_id < b_id)`, et c'est délibéré : une conversation
--   avec un hôtel reste une conversation entre DEUX PERSONNES — le voyageur et
--   le gérant — elle porte simplement SUR une page. La RLS existante
--   (« je vois mes conversations ») s'applique donc telle quelle, sans une
--   ligne de changement, et les deux mêmes personnes peuvent avoir en parallèle
--   une conversation personnelle et une conversation professionnelle sans
--   qu'elles se mélangent.
create or replace function public.ouvrir_conversation_page(p_page uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_a uuid; v_b uuid; v_id uuid;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;

  select owner_id into v_prop from public.pages where id = p_page and is_published;
  if v_prop is null then
    raise exception 'Cet etablissement ne recoit pas encore de messages.';
  end if;
  if v_prop = v_moi then raise exception 'C''est votre propre etablissement.'; end if;

  v_a := least(v_moi, v_prop); v_b := greatest(v_moi, v_prop);
  select id into v_id from public.conversations
   where a_id = v_a and b_id = v_b and page_id = p_page;
  if v_id is null then
    insert into public.conversations (a_id, b_id, page_id) values (v_a, v_b, p_page)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Recherche d'établissements. Pagination par KEYSET sur (completeness, id) :
-- l'offset décale tout dès qu'une fiche est publiée pendant la navigation.
create or replace function public.chercher_pages(
  p_lieu text default null,
  p_categorie text default null,
  p_prix_max bigint default null,
  p_plat text default null,
  p_curseur_score smallint default null,
  p_curseur_id uuid default null,
  p_limite integer default 12)
returns table (
  id uuid, slug text, name text, categories text[], short_desc text,
  cover_url text, place_slug text, place_name text, landmark text,
  price_min_ar bigint, price_min_unit text, rating_avg numeric, rating_count integer,
  verification_status text, completeness smallint, prix_du_plat bigint)
language sql stable security definer set search_path = public as $$
  with lieu as (
    select id from public.places where p_lieu is not null and slug = p_lieu
  ), zone as (
    select d.id from lieu l cross join lateral public.lieu_et_descendants(l.id) d
  ), plat as (
    select id from public.dishes where p_plat is not null and slug = p_plat
  )
  select p.id, p.slug, p.name, p.categories, p.short_desc, p.cover_url,
         pl.slug, pl.name_fr, p.landmark,
         p.price_min_ar, p.price_min_unit, p.rating_avg, p.rating_count,
         p.verification_status, p.completeness,
         (select min(mi.price_ar) from public.menu_items mi
           where mi.page_id = p.id and mi.in_stock
             and mi.dish_id = (select plat.id from plat)) as prix_du_plat
    from public.pages p
    left join public.places pl on pl.id = p.place_id
   where p.is_published
     and (p_lieu is null      or p.place_id in (select zone.id from zone))
     and (p_categorie is null or p_categorie = any(p.categories))
     and (p_prix_max is null  or (p.price_min_ar is not null and p.price_min_ar <= p_prix_max))
     and (p_plat is null      or exists (
            select 1 from public.menu_items mi
             where mi.page_id = p.id and mi.in_stock
               and mi.dish_id = (select plat.id from plat)))
     and (p_curseur_score is null or p_curseur_id is null
          or (p.completeness, p.id) < (p_curseur_score, p_curseur_id))
   order by p.completeness desc, p.id desc
   limit least(greatest(coalesce(p_limite, 12), 1), 40)
$$;

-- ⭐ LA PROMESSE CENTRALE DU PRODUIT.
-- « Je cherche du ravitoto » : on fait le tour de tous les restaurants qui le
-- servent, et on montre LE PRIX CHEZ CHACUN. C'est ce que ni Google Maps ni
-- TripAdvisor ne savent faire à Madagascar.
-- Le terme passe d'abord par resoudre_plat, donc « ravi-toto », « feuilles de
-- manioc pilées » et « ravitotoo » mènent au même endroit.
create or replace function public.restaurants_par_plat(
  p_plat text, p_lieu text default null, p_limite integer default 20)
returns table (
  page_id uuid, page_slug text, page_name text, place_name text, landmark text,
  cover_url text, rating_avg numeric, rating_count integer,
  nom_sur_la_carte text, price_ar bigint, price_unit text, is_signature boolean)
language sql stable security definer set search_path = public as $$
  with d as (
    select dd.id from public.dishes dd where dd.slug = p_plat
     union all
    select r.id from public.resoudre_plat(p_plat, 1) r
     where not exists (select 1 from public.dishes where slug = p_plat)
  ), lieu as (
    select id from public.places where p_lieu is not null and slug = p_lieu
  ), zone as (
    select z.id from lieu l cross join lateral public.lieu_et_descendants(l.id) z
  )
  select p.id, p.slug, p.name, pl.name_fr, p.landmark, p.cover_url,
         p.rating_avg, p.rating_count, mi.name, mi.price_ar, mi.price_unit, mi.is_signature
    from public.menu_items mi
    join public.pages p on p.id = mi.page_id and p.is_published
    left join public.places pl on pl.id = p.place_id
   where mi.in_stock
     and mi.dish_id in (select d.id from d limit 1)
     and (p_lieu is null or p.place_id in (select zone.id from zone))
   order by mi.price_ar nulls last, p.rating_avg desc
   limit least(greatest(coalesce(p_limite, 20), 1), 50)
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. PRIVILÈGES
-- ⚠ Rappel des migrations 0002/0003 : fermer une fonction demande TROIS
--   révocations — PUBLIC (défaut PostgreSQL), anon puis authenticated
--   (privilèges par défaut de Supabase). L'oubli d'`anon` a réellement laissé
--   ouvrir_conversation() appelable sans compte pendant plusieurs semaines ;
--   la ligne de fermeture est en fin de fichier.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.maj_prix_page(uuid)','public.trg_maj_prix()','public.pages_avant_ecriture()',
    'public.maj_note_page()','public.maj_compteurs_referentiels()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke execute on function public.page_publiee(uuid)       from public, anon, authenticated;
revoke execute on function public.page_a_moi(uuid)         from public, anon, authenticated;
revoke execute on function public.page_du_circuit(uuid)    from public, anon, authenticated;
revoke execute on function public.page_de_la_chambre(uuid) from public, anon, authenticated;
revoke execute on function public.lieu_et_descendants(uuid) from public, anon, authenticated;
revoke execute on function public.get_page_by_slug(text)    from public, anon, authenticated;
revoke execute on function public.ouvrir_conversation_page(uuid) from public, anon, authenticated;
revoke execute on function public.chercher_pages(text,text,bigint,text,smallint,uuid,integer)
  from public, anon, authenticated;
revoke execute on function public.restaurants_par_plat(text,text,integer) from public, anon, authenticated;

grant execute on function public.page_publiee(uuid)        to anon, authenticated;
grant execute on function public.page_a_moi(uuid)          to anon, authenticated;
grant execute on function public.page_du_circuit(uuid)     to anon, authenticated;
grant execute on function public.page_de_la_chambre(uuid)  to anon, authenticated;
grant execute on function public.lieu_et_descendants(uuid) to anon, authenticated;
grant execute on function public.get_page_by_slug(text)    to anon, authenticated;
grant execute on function public.ouvrir_conversation_page(uuid) to authenticated;
grant execute on function public.chercher_pages(text,text,bigint,text,smallint,uuid,integer)
  to anon, authenticated;
grant execute on function public.restaurants_par_plat(text,text,integer) to anon, authenticated;

revoke insert, update, delete on
  public.pages, public.page_amenities, public.page_hours, public.room_types,
  public.season_rates, public.menu_sections, public.menu_items, public.menu_photos,
  public.activities, public.tours, public.tour_days, public.tour_prices,
  public.tour_inclusions, public.reviews, public.review_replies, public.post_mentions
  from anon;

-- Faille héritée de 0003, fermée ici : la révocation d'origine ne visait que
-- PUBLIC, alors que Supabase avait déjà accordé EXECUTE à anon.
revoke execute on function public.ouvrir_conversation(uuid) from public, anon;
grant  execute on function public.ouvrir_conversation(uuid) to authenticated;
