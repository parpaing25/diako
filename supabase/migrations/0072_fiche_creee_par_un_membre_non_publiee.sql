-- ============================================================================
-- 0072 — UNE FICHE CRÉÉE PAR UN MEMBRE N'EST PLUS PUBLIÉE D'OFFICE
--
-- 🔴 LA PORTE DÉROBÉE DU SYSTÈME DE REVENDICATION. `pages.is_published` valait
--    `true` PAR DÉFAUT, et `pages_avant_ecriture` ne le gelait pas à
--    l'insertion. Combiné à la policy `pages_creer` —
--    `with check (owner_id = auth.uid())` — n'importe quel compte connecté
--    pouvait appeler `creerEtablissement()` avec le nom d'un hôtel existant, et
--    sa fiche partait EN LIGNE immédiatement, avec lui comme propriétaire.
--
--    Tout le dispositif de revendication verrouillé en 0070 — pro obligatoire,
--    écriture directe fermée, acceptation par un administrateur — se
--    contournait donc en ne revendiquant rien : il suffisait de créer.
--
-- ⚠ LES 3 254 FICHES EXISTANTES NE BOUGENT PAS. Elles sont publiées et sans
--   propriétaire : c'est l'annuaire éditorial importé d'OpenStreetMap, il doit
--   rester visible. On ne change que le DÉFAUT et le comportement à l'insertion
--   par un membre. Vérifié après application : 3 254 toujours publiées.
--
-- ⚠ POURQUOI « NON PUBLIÉE » EST LE BON DÉFAUT ICI, ET PAS UNE GÊNE. Presque
--   tous les hôtels et restaurants du pays sont DÉJÀ en base : le geste normal
--   d'un professionnel est de REVENDIQUER une fiche existante, pas d'en créer
--   une. La création est l'exception — un établissement neuf, ou absent d'OSM.
--   Elle mérite le même regard humain qu'une revendication.
--
-- ⚠ L'AUTEUR VOIT TOUJOURS SA FICHE : `pages_lecture` autorise déjà
--   `owner_id = auth.uid()`. Il peut la compléter en attendant l'examen ; c'est
--   le public qui ne la voit pas encore. L'écran de création doit le DIRE —
--   sans quoi il croira que l'enregistrement a échoué.
-- ============================================================================

alter table public.pages alter column is_published set default false;

create or replace function public.pages_avant_ecriture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_score smallint := 0;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;
    new.views_count  := old.views_count;
    -- 🔴 LA MISE EN LIGNE N'APPARTIENT PAS AU PROPRIÉTAIRE. Sans ce gel, il
    --    suffisait de créer la fiche puis de la passer à `true` d'un UPDATE.
    if pg_trigger_depth() <= 1 then
      new.is_published     := old.is_published;
      new.price_min_ar     := old.price_min_ar;
      new.price_min_unit   := old.price_min_unit;
      new.rates_checked_at := old.rates_checked_at;
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
end $$;
