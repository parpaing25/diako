-- ============================================================================
-- 0121 — INDEX SUR LES CLÉS ÉTRANGÈRES QUI N'EN AVAIENT PAS, ET DEUX PETITS
--        RÉGLAGES SIGNALÉS PAR LES ADVISORS (audit du 05/09/2026, 03-09)
--
-- ⚠ Les 25 colonnes ci-dessous sont celles que `pg_index` ne couvrait pas le
--   05/09/2026 (requête dans 03-09). Les tables sociales sont vides aujourd'hui ;
--   elles ne le resteront pas, et un `delete` sur profiles doit pouvoir suivre
--   ses cascades sans balayer comments, messages ou follows en entier.
-- ⚠ Pas de `concurrently` : les tables sont vides ou petites, et le connecteur
--   applique la migration dans une transaction.
-- ============================================================================

create index if not exists place_access_from_place_id_idx      on public.place_access (from_place_id);
create index if not exists comments_author_id_idx              on public.comments (author_id);
create index if not exists comments_parent_id_idx              on public.comments (parent_id);
create index if not exists saves_post_id_idx                   on public.saves (post_id);
create index if not exists follows_target_id_idx               on public.follows (target_id);
create index if not exists messages_sender_id_idx              on public.messages (sender_id);
create index if not exists reports_reporter_id_idx             on public.reports (reporter_id);
create index if not exists blocks_blocked_id_idx               on public.blocks (blocked_id);
create index if not exists dishes_typical_place_id_idx         on public.dishes (typical_place_id);
create index if not exists trip_offers_author_id_idx           on public.trip_offers (author_id);
create index if not exists page_amenities_code_idx             on public.page_amenities (code);
create index if not exists menu_items_section_id_idx           on public.menu_items (section_id);
create index if not exists tours_start_place_id_idx            on public.tours (start_place_id);
create index if not exists tours_end_place_id_idx              on public.tours (end_place_id);
create index if not exists tour_days_place_id_idx              on public.tour_days (place_id);
create index if not exists reviews_author_id_idx               on public.reviews (author_id);
create index if not exists review_replies_page_id_idx          on public.review_replies (page_id);
create index if not exists page_claims_user_id_idx             on public.page_claims (user_id);
create index if not exists dish_tastings_post_id_idx           on public.dish_tastings (post_id);
create index if not exists events_page_id_idx                  on public.events (page_id);
create index if not exists guides_place_id_idx                 on public.guides (place_id);
create index if not exists places_merged_into_idx              on public.places (merged_into);
create index if not exists page_gestionnaires_ajoute_par_idx   on public.page_gestionnaires (ajoute_par);
create index if not exists promo_codes_cree_par_idx            on public.promo_codes (cree_par);
create index if not exists photo_propositions_traite_par_idx   on public.photo_propositions (traite_par);

-- Advisor `function_search_path_mutable` : la fonction n'est pas SECURITY
-- DEFINER, le risque est théorique, mais le réglage coûte une ligne.
alter function public.dk_famille_carte(text, text[], text) set search_path = public;

-- ⚠ SUPPRESSION DE COMPTE (03-11). `page_gestionnaires.ajoute_par` référençait
--   profiles SANS action : supprimer le compte d'un gérant qui avait nommé un
--   cogestionnaire aurait échoué sur cette clé. On garde la ligne du
--   cogestionnaire, on oublie qui l'a ajouté.
alter table public.page_gestionnaires
  drop constraint if exists page_gestionnaires_ajoute_par_fkey,
  add constraint page_gestionnaires_ajoute_par_fkey
    foreign key (ajoute_par) references public.profiles (id) on delete set null;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare n integer;
begin
  select count(*) into n
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = a.attnum);
  if n > 0 then
    raise exception '0121 : % clé(s) étrangère(s) encore sans index', n;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'page_gestionnaires_ajoute_par_fkey' and confdeltype = 'n'
  ) then
    raise exception '0121 : page_gestionnaires.ajoute_par n''est pas en ON DELETE SET NULL';
  end if;
end $$;
