-- ============================================================================
-- 0040 — CORRECTION D'UNE RÉGRESSION QUE J'AI INTRODUITE EN 0037
--
-- 🔴 CE QUI ÉTAIT CASSÉ, ET ÇA L'ÉTAIT TOTALEMENT.
--    La migration 0037 recrée `pages_avant_ecriture` pour y ajouter le gel de
--    `price_min_ar`. Le corps de la fonction a été RETAPÉ DE MÉMOIRE au lieu
--    d'être copié depuis 0008. Deux erreurs en sont sorties :
--
--    ① `array_length(new.gallery, 1)` — or `gallery` est du **jsonb**
--       (0007:68), pas un tableau Postgres. La fonction levait donc
--         ERROR 42883: function array_length(jsonb, integer) does not exist
--       à CHAQUE insert et à CHAQUE update sur `pages`. Autrement dit : depuis
--       0037, plus AUCUNE fiche ne pouvait être créée ni modifiée. La console
--       professionnelle était entièrement hors service, sans que rien ne le
--       signale — l'erreur n'apparaît qu'au moment de l'écriture, et il n'y a
--       aujourd'hui aucun gérant pour la déclencher.
--
--    ② Le barème de complétude avait été réinventé : de mauvais poids, des
--       critères absents (les chambres, les cartes, les activités, les
--       circuits), et un critère inventé (`website or facebook`). La
--       complétude pilote le CLASSEMENT des résultats de recherche : un barème
--       faux réordonne tout l'annuaire en silence.
--
-- ⚠ LA LEÇON, ET ELLE EST CHÈRE. On ne recrée jamais une fonction de mémoire.
--   `create or replace` écrase sans avertir : il faut partir du corps EXACT de
--   la dernière migration qui l'a définie, et n'y toucher qu'à l'endroit voulu.
--   Ici le seul ajout légitime tenait en quatre lignes.
--
-- ⚠ CE QUI A RÉVÉLÉ LE DÉFAUT : la première tentative d'import de masse. Une
--   seule ligne insérée a suffi. Un jeu de données réel est le meilleur test
--   d'un déclencheur — aucun test unitaire du dépôt ne touche cette fonction.
-- ============================================================================

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

    -- ── LE SEUL AJOUT DE 0037 QUI ÉTAIT LÉGITIME ───────────────────────
    -- Le prix d'appel est DÉRIVÉ des chambres et des tarifs de saison par
    -- `maj_prix_page` : il ne se saisit pas à la main. Sans ce gel, un gérant
    -- le forçait à 1 000 Ar et passait en tête de tous les filtres budget.
    -- ⚠ La garde de profondeur est indispensable : `maj_prix_page` fait un
    --   UPDATE ordinaire dans la session du gérant. Restaurer aveuglément
    --   casserait la mise à jour LÉGITIME du prix.
    if pg_trigger_depth() <= 1 then
      new.price_min_ar     := old.price_min_ar;
      new.price_min_unit   := old.price_min_unit;
      new.rates_checked_at := old.rates_checked_at;
    end if;
  elsif tg_op = 'INSERT' and not public.is_admin() then
    new.verification_status := 'none';
    new.rating_avg := 0; new.rating_count := 0; new.views_count := 0;
    -- À la création, la fiche n'a aucune chambre : le prix ne peut pas exister.
    new.price_min_ar := null; new.price_min_unit := null; new.rates_checked_at := null;
  end if;

  -- La complétude pilote le classement : une fiche renseignée passe devant une
  -- fiche vide, ce qui est la seule incitation honnête à bien remplir.
  -- ⚠ BARÈME REPRIS MOT POUR MOT DE 0008:144-155. Ne pas le réécrire.
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
