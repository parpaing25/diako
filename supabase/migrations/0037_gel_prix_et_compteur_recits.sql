-- ============================================================================
-- 0037 — LE PRIX D'APPEL EST GELÉ, ET LE COMPTEUR DE RÉCITS SE MET À JOUR
--
-- Deux constats de l'audit du 15/08/2026, de la même famille : une valeur
-- qu'on croyait protégée ou entretenue, et qui ne l'était pas.
-- ============================================================================

/* ── ① `price_min_ar` n'était pas protégé, contrairement à ce qui est écrit ──
   CLAUDE.md déclare : « `featured_until`, `verification_status`, `rating_avg`,
   `is_published`, `price_min_ar` sont protégés par trigger. » Le trigger
   `pages_avant_ecriture` (0008:132-140) ne restaure en réalité que
   `verification_status`, `rating_avg`, `rating_count` et `views_count`.

   Un gérant fait `update pages set price_min_ar = 1000` et remonte en tête de
   TOUS les filtres budget avec un prix qui ne correspond à aucune chambre.
   Le prix d'appel n'est pas un champ éditorial : il est CALCULÉ à partir des
   chambres et des tarifs de saison par `maj_prix_page`.

   ⚠ LE PIÈGE, ET C'EST POUR LUI QUE LA GARDE EXISTE. `maj_prix_page` fait un
     UPDATE ordinaire sur `pages`, dans la session du gérant. Restaurer
     aveuglément l'ancienne valeur casserait donc la mise à jour LÉGITIME du
     prix : la fiche n'afficherait plus jamais le tarif d'une chambre saisie.
     `pg_trigger_depth() > 1` distingue les deux — un UPDATE venu d'un autre
     trigger passe, un UPDATE venu du client ne passe pas.                    */
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

    -- Le prix d'appel est dérivé, jamais saisi : seul un trigger peut l'écrire.
    if pg_trigger_depth() <= 1 then
      new.price_min_ar    := old.price_min_ar;
      new.price_min_unit  := old.price_min_unit;
      new.rates_checked_at := old.rates_checked_at;
    end if;
  elsif tg_op = 'INSERT' and not public.is_admin() then
    new.verification_status := 'none';
    new.rating_avg := 0; new.rating_count := 0; new.views_count := 0;
    -- À la création, la fiche n'a aucune chambre : le prix ne peut pas exister.
    new.price_min_ar := null; new.price_min_unit := null; new.rates_checked_at := null;
  end if;

  if coalesce(length(new.short_desc), 0) > 20 then v_score := v_score + 10; end if;
  if coalesce(length(new.long_desc), 0)  > 80 then v_score := v_score + 10; end if;
  if new.cover_url is not null              then v_score := v_score + 10; end if;
  if new.phone is not null                  then v_score := v_score + 10; end if;
  if new.place_id is not null               then v_score := v_score + 10; end if;
  if new.lat is not null                    then v_score := v_score + 10; end if;
  if coalesce(array_length(new.gallery, 1), 0) >= 3 then v_score := v_score + 10; end if;
  if new.price_min_ar is not null           then v_score := v_score + 15; end if;
  if new.website is not null or new.facebook is not null then v_score := v_score + 5; end if;
  if new.verification_status <> 'none'      then v_score := v_score + 10; end if;
  new.completeness := v_score;

  return new;
end $$;

/* ── ② `places.nb_posts` valait 0 sur les 178 lieux ─────────────────────────
   La colonne a été créée puis remplie UNE fois par le seed, sur une table de
   publications vide. Aucun déclencheur ne la recalcule depuis.

   Conséquences mesurées : le lien « Lire les N récits » de l'écran Explorer ne
   s'affiche JAMAIS malgré 28 récits publiés, et les deux tris « par
   popularité » dégénèrent en tri alphabétique.

   ⚠ ON RECALCULE, ON N'INCRÉMENTE PAS. Un compteur incrémental dérive au
     premier changement de lieu ou à la première suppression, et rien ne le
     signale. Un `count(*)` sur une table indexée par `place_id` reste
     imperceptible à cette échelle, et il est JUSTE.                          */
create or replace function public.maj_nb_posts()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lieux uuid[];
begin
  v_lieux := array_remove(array[
    case when tg_op <> 'INSERT' then old.place_id end,
    case when tg_op <> 'DELETE' then new.place_id end
  ], null);

  update public.places pl
     set nb_posts = (select count(*) from public.posts p
                      where p.place_id = pl.id and p.status = 'published')
   where pl.id = any(v_lieux);

  return null;
end $$;

drop trigger if exists posts_maj_nb_posts on public.posts;
create trigger posts_maj_nb_posts
  after insert or delete or update of place_id, status on public.posts
  for each row execute function public.maj_nb_posts();

-- Rattrapage : la colonne est fausse depuis le seed sur les 178 lieux.
update public.places pl
   set nb_posts = (select count(*) from public.posts p
                    where p.place_id = pl.id and p.status = 'published');

/* Même problème sur `nb_pages`, et même remède. */
create or replace function public.maj_nb_pages()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lieux uuid[];
begin
  v_lieux := array_remove(array[
    case when tg_op <> 'INSERT' then old.place_id end,
    case when tg_op <> 'DELETE' then new.place_id end
  ], null);

  update public.places pl
     set nb_pages = (select count(*) from public.pages pg
                      where pg.place_id = pl.id and pg.is_published)
   where pl.id = any(v_lieux);

  return null;
end $$;

drop trigger if exists pages_maj_nb_pages on public.pages;
create trigger pages_maj_nb_pages
  after insert or delete or update of place_id, is_published on public.pages
  for each row execute function public.maj_nb_pages();

update public.places pl
   set nb_pages = (select count(*) from public.pages pg
                    where pg.place_id = pl.id and pg.is_published);
