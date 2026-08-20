-- ============================================================================
-- 0107 — SEPT SITES PUBLIÉS NE SONT PAS À MADAGASCAR, MAIS AUX COMORES
--
-- 🔴 CE QUE LE VISITEUR VOYAIT. « Medina of Moroni », « National Museum of the
--    Comoros », « Volo Volo Market », « Old Friday Mosque », et les médinas
--    d'Ikoni, d'Itsandra et de Ntsudjini : sept fiches publiées dans l'annuaire
--    « Sites et parcs » d'un site consacré à Madagascar. Toutes se trouvent sur
--    la Grande Comore, autour de Moroni — un AUTRE pays, à 300 km de la côte
--    nord-ouest. L'une d'elles porte le nom de ce pays dans son titre.
--
--    Elles viennent de l'import OpenStreetMap (0045) : la requête de moisson a
--    ratissé une boîte géographique un peu large, et l'archipel des Comores
--    tombe juste au nord de Madagascar.
--
-- ⚠ ON DÉPUBLIE, ON NE SUPPRIME PAS. La ligne garde sa trace : si quelqu'un
--   réimporte demain la même zone, le doublon se verra au lieu de revenir en
--   silence. C'est la même prudence qu'en 0051.
--
-- ⚠ CE QUI N'EST PAS TOUCHÉ, ET POURQUOI. « Île Juan de Nova » (-17,05 / 42,73)
--   est une Île Éparse : administrée par la France, REVENDIQUÉE par Madagascar.
--   Sa présence ou son absence dans l'annuaire est une position, pas une
--   correction technique — ce n'est pas à une migration de trancher. Elle reste
--   publiée ; le propriétaire décide.
--
-- 🔴 ET UNE LEÇON SUR LA FAÇON DE CHERCHER. Un premier contrôle écrit à la
--    va-vite avec « lat > -11,5 » n'avait RIEN trouvé : Moroni est à -11,70, il
--    passait juste sous le seuil. Les vraies limites du pays sont écrites ici
--    pour que le prochain import les reprenne — du Cap d'Ambre (-11,95) au Cap
--    Sainte-Marie (-25,60), et de 43,18 à 50,50 en longitude, avec une marge de
--    0,15° pour les îlots côtiers.
-- ============================================================================

do $$
declare n integer;
begin
  update public.attractions
     set is_published = false
   where is_published
     and lat between -11.80 and -11.50
     and lng between 43.00 and 43.60;

  get diagnostics n = row_count;
  raise notice '0107 : % fiche(s) des Comores dépubliée(s)', n;
end $$;

do $$
declare
  v_restant integer;
  v_noms    text;
begin
  -- ① Plus aucune fiche publiée sur la Grande Comore.
  select count(*), string_agg(name, ', ')
    into v_restant, v_noms
    from public.attractions
   where is_published
     and lat between -11.80 and -11.50
     and lng between 43.00 and 43.60;
  if v_restant > 0 then
    raise exception '0107 : % fiche(s) des Comores encore publiée(s) : %', v_restant, v_noms;
  end if;

  -- ② ON N'A PAS DÉPUBLIÉ MADAGASCAR AU PASSAGE. Le garde-fou qui compte : une
  --    borne mal écrite pourrait vider l'annuaire, et ça ne se verrait qu'à
  --    l'écran, plus tard.
  select count(*) into v_restant from public.attractions where is_published;
  if v_restant < 2400 then
    raise exception '0107 : seulement % sites publiés restants — la dépublication a mordu trop large', v_restant;
  end if;

  -- ③ État des lieux, pas une erreur : ce qui tombe hors des limites du pays.
  select count(*), string_agg(name, ', ')
    into v_restant, v_noms
    from public.attractions
   where is_published
     and (lat > -11.80 or lat < -25.75 or lng < 43.03 or lng > 50.65);
  if v_restant > 0 then
    raise warning '0107 : % site(s) publié(s) hors des limites de Madagascar : % — à arbitrer à la main', v_restant, v_noms;
  end if;
end $$;
