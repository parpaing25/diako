-- ==========================================================================
-- 0101 — LES PHOTOS DES PLATS, AVEC LEUR ATTRIBUTION
--
-- 🔴 L'ATLAS DES PLATS AFFICHAIT 95 RECTANGLES GRIS. `photo_url` était nul sur
--    95 lignes sur 95, alors que la page est faite de vignettes.
--
-- ⚠ SOURCE : WIKIMEDIA COMMONS, moissonné par scripts/photos_plats.py, images
--   réhébergées sur o2switch (jamais Supabase Storage : facteur 17 sur
--   l'egress). Les trois colonnes d'attribution de 0096 sont posées dans le
--   MÊME update : une photo CC BY-SA sans son auteur n'est pas gratuite.
--
-- 🔴 CE QUI N'EST PAS ICI, ET POURQUOI. Les filtres textuels avaient retenu 50
--    images ; 17 étaient fausses et n'ont été démasquées qu'en REGARDANT les
--    vignettes : une bouteille de soda pour « bonbon anglais », une photo de
--    groupe pour « carpe », des poulets crus pour « poulet grillé », un dessin
--    au trait pour « espadon », et deux paires de doublons. Les motifs sont
--    dans scripts/plats_refuses.py. Les plats non couverts gardent une case
--    VIDE : une photo fausse sur un plat ne se repère plus jamais, puisque le
--    visiteur consulte justement l'atlas pour découvrir le plat.
-- ==========================================================================

do $$
begin
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/achard.jpg', photo_credit = 'The original uploader was Mj971 at French Wikipedia .', photo_licence = 'CC BY-SA 2.0 fr', photo_source = 'https://commons.wikimedia.org/wiki/File:Achards.jpg' where slug = 'achard';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/akoho-sy-voanio.jpg', photo_credit = 'Chirocca77', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Poulet_au_coco.jpg' where slug = 'akoho-sy-voanio';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/amalona.jpg', photo_credit = 'Neri.jp', photo_licence = 'CC BY-SA 3.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Anguille-grill%C3%A9e.jpg' where slug = 'amalona';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/anana.jpg', photo_credit = 'Leja Mitarika', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Anana_(l%C3%A9gume_enrichissant_de_Madagascar).jpg' where slug = 'anana';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/bonbon-coco.jpg', photo_credit = 'Florantsika', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Bonbon_coco.jpg' where slug = 'bonbon-coco';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/brochette.jpg', photo_credit = 'Chirocca77', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Brochette_bord_de_la_mer_Mahajanga_Madagascar.jpg' where slug = 'brochette';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/calamar.jpg', photo_credit = 'Claudia Rahary Soa', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Vingt-cinqui%C3%A8me_(25)_anniversaire_de_wikip%C3%A9dia_%C3%A0_Madagascar_21.jpg' where slug = 'calamar';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/crevettes.jpg', photo_credit = 'TIANASAL', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Crevettes_s%C3%A8ches.jpg' where slug = 'crevettes';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/eau-de-coco.jpg', photo_credit = 'Mammysou17', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Eau_de_coco.jpg' where slug = 'eau-de-coco';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/huitres.jpg', photo_credit = 'Myrabella', photo_licence = 'CC BY-SA 3.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Huitres_Cancale.jpg' where slug = 'huitres';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/kabaro.jpg', photo_credit = 'Chirocca77', photo_licence = 'CC BY 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Pois_du_cap_ou_tsidimy_03.jpg' where slug = 'kabaro';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/kitoza.jpg', photo_credit = 'SurreyJohn', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Meat_Stall_in_Antanavario.JPG' where slug = 'kitoza';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/koba.jpg', photo_credit = 'Sunielle', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Koba_cuit.jpg' where slug = 'koba';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/langouste.jpg', photo_credit = 'Olivdediego', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Langouste_grill%C3%A9e_de_Ramena.JPG' where slug = 'langouste';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/lasary-voatabia.jpg', photo_credit = 'Raveloaritiana Mamisoa', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Vary_sy_laoka_miaraka_amin%27ny_lasary_voatabia.jpg' where slug = 'lasary-voatabia';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/lasopy.jpg', photo_credit = 'Promo2024', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Lasopy_tongotromby.jpg' where slug = 'lasopy';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/mine-sao.jpg', photo_credit = 'Chirocca77', photo_licence = 'CC BY 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Mi_sao_no_regime.jpg' where slug = 'mine-sao';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/mofo-akondro.jpg', photo_credit = 'Managnandro', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Mofo_akondro.jpg' where slug = 'mofo-akondro';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/mofo-gasy.jpg', photo_credit = 'Cm Malagasy', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Mofo_gasy_de_Madagascar.jpg' where slug = 'mofo-gasy';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/poisson-grille.jpg', photo_credit = 'Quinze2001', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Poisson_grill%C3%A9_de_Madagascar.jpg' where slug = 'poisson-grille';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/ravimbomanga.jpg', photo_credit = 'Lemurbaby at English Wikipedia', photo_licence = 'CC BY 3.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Ravimbomanga_Madagascar_Food.jpg' where slug = 'ravimbomanga';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/rhum-arrange.jpg', photo_credit = 'Bernard Gagnon', photo_licence = 'CC BY-SA 3.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Rhum_arrang%C3%A9_Madagascar.jpg' where slug = 'rhum-arrange';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/riz-cantonais.jpg', photo_credit = 'HYL56', photo_licence = 'CC BY 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Riz_Cantonais_au_Poulet_sauce.jpg' where slug = 'riz-cantonais';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/romazava.jpg', photo_credit = 'Draky Man', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:ROMAZAVA.jpg' where slug = 'romazava';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/sakay.jpg', photo_credit = 'Andrianarivelo Rotsy Fitiavana', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Piment_Rouge_-_Sakay_mena.jpg' where slug = 'sakay';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/soupe-chinoise.jpg', photo_credit = 'voyage-madagascar.org from Antananarivo, Madagascar', photo_licence = 'CC BY 2.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Soupe_chinoise_de_Toamasina_Madagascar_(21663618781).jpg' where slug = 'soupe-chinoise';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/tsaramaso.jpg', photo_credit = 'Belouh91', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Tsaramaso_sy_hena_omby.jpg' where slug = 'tsaramaso';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/varanga.jpg', photo_credit = 'Z thomas', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Varanga_Antananarivo_2019-10-21.jpg' where slug = 'varanga';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/vary-be-menaka.jpg', photo_credit = 'MPMF24', photo_licence = 'CC BY 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Vary_be_menaka_MPMF24.jpg' where slug = 'vary-be-menaka';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/vary-maina.jpg', photo_credit = 'Tapa02', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Felimorongo_masaka_@vary_maina_Gasy.jpg' where slug = 'vary-maina';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/vary-sosoa.jpg', photo_credit = 'Chirocca77', photo_licence = 'CC0', photo_source = 'https://commons.wikimedia.org/wiki/File:Riz_mou-sabeda-vary_sosoa.jpg' where slug = 'vary-sosoa';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/voanjobory.jpg', photo_credit = 'Lemurbaby at English Wikipedia', photo_licence = 'CC BY 3.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Voanjobory_Bambara_Groundnut_Madagascar.jpg' where slug = 'voanjobory';
  update public.dishes set photo_url = 'https://diako.fonenako.mg/uploads/pages/plats/voatsiperifery.jpg', photo_credit = 'Didier Descouens', photo_licence = 'CC BY-SA 4.0', photo_source = 'https://commons.wikimedia.org/wiki/File:Piper_borbonense_(Wild_Voatsiperifery_Pepper)_Fianarantsoa_Madagascar.jpg' where slug = 'voatsiperifery';
end $$;

-- ⚠ L'ASSERTION PORTE SUR L'ATTRIBUTION, PAS SUR LE COMPTE. Une photo posée
--   sans auteur ni licence serait une infraction silencieuse : mieux vaut que
--   la migration échoue ici.
do $$
declare n int;
begin
  select count(*) into n from public.dishes
   where photo_url is not null
     and (photo_credit is null or photo_licence is null or photo_source is null);
  if n > 0 then
    raise exception 'ATTRIBUTION MANQUANTE sur % plat(s) : une photo Commons sans auteur ni licence ne peut pas etre publiee', n;
  end if;
end $$;
