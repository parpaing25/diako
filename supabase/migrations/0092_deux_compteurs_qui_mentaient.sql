-- ============================================================================
-- 0092 — DEUX COMPTEURS AFFICHÉS QUE RIEN N'ALIMENTAIT
--
-- 🔴 `pages.views_count` : LE GÉRANT LIT « 0 vue », TOUJOURS. La colonne est
--    affichée dans la console professionnelle, et AUCUN code ne l'incrémente —
--    ni déclencheur, ni RPC, ni écriture cliente. L'audience réelle est
--    enregistrée ailleurs, dans `page_views`, par CHEMIN (`/p/<slug>`), et rien
--    ne relie les deux : `page_views` n'a même pas de colonne `page_id`.
--    Conséquence : le premier professionnel qui revendiquera sa fiche verra
--    « 0 vue » quoi qu'il arrive, en conclura que Diako n'apporte personne, et
--    aura raison de le croire — c'est ce que l'écran lui dit.
--
-- ⚠ ON RÉPARE PAR UN DÉCLENCHEUR SUR `page_views`, PAS PAR UN RECALCUL
--   PÉRIODIQUE. Un recalcul nocturne laisserait la journée en cours à zéro, et
--   c'est justement le chiffre qu'on regarde après avoir partagé son lien.
--
-- ⚠ LE RATTACHEMENT SE FAIT SUR LE SLUG, une seule fois, à l'insertion. Le
--   faire à la lecture obligerait chaque affichage à découper des chaînes sur
--   toute la table.
--
-- 🔴 `dishes.nb_restaurants` : ZÉRO SUR LES 95 PLATS, ET C'EST UNE CLÉ DE TRI.
--    L'atlas culinaire propose « les plats les plus servis d'abord » : toutes
--    les valeurs étant égales, le tri ne trie RIEN et l'ordre retombe sur le
--    nom. L'option existe, elle est cliquable, elle n'a aucun effet.
--    ⚠ La cause est en amont : `menu_items.dish_id` est nul sur les 4 lignes de
--      carte existantes — aucun restaurant n'a encore relié un plat de sa carte
--      au référentiel. Le compteur restera donc à zéro tant que ce sera vrai,
--      MAIS il deviendra juste tout seul dès la première liaison, au lieu de
--      rester faux pour toujours.
-- ============================================================================

-- 🔴 ET VOICI POURQUOI RIEN NE L'INCRÉMENTAIT — CE N'ÉTAIT PAS UN OUBLI.
--    `pages_avant_ecriture`, déclencheur BEFORE UPDATE, REMET `views_count` à
--    son ancienne valeur à chaque écriture qui n'est pas administrateur. C'est
--    un bon garde-fou, et il faut le garder : sans lui, un professionnel
--    gonflerait ses propres chiffres d'audience depuis la console.
--    Le compteur était donc pris en tenaille — personne n'écrivait dedans, et
--    quiconque aurait essayé se serait fait annuler EN SILENCE. Un `update` de
--    contrôle passé à la main rend « 0 » sans la moindre erreur : c'est ce qui
--    rend ce défaut si long à comprendre.
--
-- ⚠ ON UTILISE L'ÉCHAPPATOIRE QUE LA FONCTION EMPLOIE DÉJÀ. Elle gèle
--   `is_published`, les prix et `rates_checked_at` uniquement quand
--   `pg_trigger_depth() <= 1`, c'est-à-dire quand l'écriture vient d'un client
--   et non d'un autre déclencheur. `views_count` avait simplement été laissé
--   HORS de ce bloc. On l'y remet : une visite comptée par un déclencheur passe
--   (profondeur 2), une main qui écrit depuis la console est toujours refusée
--   (profondeur 1). La profondeur ne se falsifie pas depuis un client.
create or replace function public.pages_avant_ecriture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_score smallint := 0;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;
    -- 🔴 LA PROPRIÉTÉ NE SE CÈDE PAS DEPUIS L'ÉCRAN. Sans ce gel, un
    --    gestionnaire — qui peut désormais modifier la fiche — n'aurait qu'à
    --    écrire son propre identifiant dans `owner_id` pour évincer celui qui
    --    l'a nommé. C'est la seule escalade que la co-gestion doit rendre
    --    impossible, et elle se ferme ici, pas dans l'interface.
    new.owner_id := old.owner_id;
    if pg_trigger_depth() <= 1 then
      new.is_published     := old.is_published;
      new.price_min_ar     := old.price_min_ar;
      new.price_min_unit   := old.price_min_unit;
      new.rates_checked_at := old.rates_checked_at;
      -- ⚠ DÉPLACÉ ICI depuis le bloc du dessus : le gel doit tenir contre un
      --   client, pas contre le déclencheur qui compte les visites.
      new.views_count      := old.views_count;
    end if;
  elsif tg_op = 'INSERT' and not public.is_admin() then
    new.verification_status := 'none';
    new.rating_avg := 0; new.rating_count := 0; new.views_count := 0;
    new.price_min_ar := null; new.price_min_unit := null; new.rates_checked_at := null;
    new.is_published := false;
  end if;

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
end $function$;

-- ── ① Les vues d'une fiche ─────────────────────────────────────────────────
create or replace function public.dk_compter_vue()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_slug text;
begin
  -- ⚠ On ne touche QUE les chemins de fiche. `page_views` enregistre tout le
  --   site ; compter une visite d'accueil sur un établissement serait pire que
  --   ne rien compter.
  if new.path is null or new.path !~ '^/p/[^/?#]+' then
    return new;
  end if;
  v_slug := substring(new.path from '^/p/([^/?#]+)');
  if v_slug is null or v_slug = '' then
    return new;
  end if;
  update public.pages set views_count = coalesce(views_count, 0) + 1
   where slug = v_slug;
  return new;
end $$;

drop trigger if exists page_views_compte on public.page_views;
create trigger page_views_compte
  after insert on public.page_views
  for each row execute function public.dk_compter_vue();

-- ⚠ Le passé est repris une fois : sans ça, les 296 visites déjà enregistrées
--   resteraient invisibles et le compteur repartirait de zéro un an après le
--   lancement.
update public.pages g set views_count = v.n
  from (
    select substring(w.path from '^/p/([^/?#]+)') as slug, count(*) as n
      from public.page_views w
     where w.path ~ '^/p/[^/?#]+'
     group by 1
  ) v
 where g.slug = v.slug and coalesce(g.views_count, 0) <> v.n;

-- ── ② Le nombre d'adresses qui servent un plat ────────────────────────────
create or replace function public.dk_compter_plats()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- ⚠ Les DEUX plats sont recomptés sur une modification : celui qu'on quitte
  --   et celui qu'on rejoint. N'en recompter qu'un laisserait l'autre gonflé.
  if tg_op in ('UPDATE', 'DELETE') and old.dish_id is not null then
    update public.dishes d set nb_restaurants = (
      select count(distinct m.page_id) from public.menu_items m
       join public.pages p on p.id = m.page_id
      where m.dish_id = d.id and p.is_published)
     where d.id = old.dish_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.dish_id is not null then
    update public.dishes d set nb_restaurants = (
      select count(distinct m.page_id) from public.menu_items m
       join public.pages p on p.id = m.page_id
      where m.dish_id = d.id and p.is_published)
     where d.id = new.dish_id;
  end if;
  return null;
end $$;

drop trigger if exists menu_items_compte_plats on public.menu_items;
create trigger menu_items_compte_plats
  after insert or update of dish_id or delete on public.menu_items
  for each row execute function public.dk_compter_plats();

update public.dishes d set nb_restaurants = (
  select count(distinct m.page_id) from public.menu_items m
   join public.pages p on p.id = m.page_id
  where m.dish_id = d.id and p.is_published);

-- ⚠ TROIS RÉVOCATIONS. Ce sont des fonctions de déclencheur qui ÉCRIVENT :
--   c'est exactement la famille que 0083 a dû fermer après coup.
revoke all on function public.dk_compter_vue()   from public, anon;
revoke all on function public.dk_compter_plats() from public, anon;

-- ── Contrôle : le compteur suit vraiment ───────────────────────────────────
do $$
declare
  v_slug text; v_avant integer; v_apres integer;
begin
  select slug, coalesce(views_count, 0) into v_slug, v_avant
    from public.pages where is_published order by id limit 1;
  if v_slug is null then
    raise warning '0092 : aucune fiche publiée, contrôle non joué.';
    return;
  end if;

  insert into public.page_views (path) values ('/p/' || v_slug);
  select coalesce(views_count, 0) into v_apres from public.pages where slug = v_slug;

  -- ⚠ On efface la visite de sonde ET on remet le compteur : une vérification
  --   ne doit pas laisser de trace dans les chiffres qu'un gérant va lire.
  delete from public.page_views
   where path = '/p/' || v_slug
     and id = (select id from public.page_views
                where path = '/p/' || v_slug order by created_at desc limit 1);
  update public.pages set views_count = v_avant where slug = v_slug;

  if v_apres <> v_avant + 1 then
    raise exception
      '0092 : une visite enregistrée n''a pas incrémenté le compteur (% -> %)',
      v_avant, v_apres;
  end if;

  if has_function_privilege('anon', 'public.dk_compter_vue()', 'execute')
     or has_function_privilege('anon', 'public.dk_compter_plats()', 'execute') then
    raise exception '0092 : anon peut exécuter une fonction de déclencheur qui écrit';
  end if;
end $$;
