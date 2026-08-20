-- ==========================================================================
-- 0105 — LES AFFICHES DES EVENEMENTS, AVEC LEUR ATTRIBUTION
--
-- 🔴 /evenements AFFICHAIT 42 RECTANGLES GRIS. `poster_url` etait nul sur 42
--    lignes sur 42, alors que l'ecran est une grille de cartes.
--
-- ⚠ UN RAPPROCHEMENT PAR TITRE NE POUVAIT PAS MARCHER, contrairement aux
--   plats : « Assomption » ou « Fete du Travail » ne designent rien de
--   malgache sur Commons. Le SUJET de chaque evenement a donc ete ecrit a la
--   main (scripts/photos_evenements.py), en preferant les noms scientifiques,
--   bien plus discriminants : « Adansonia grandidieri », « Megaptera
--   novaeangliae », « Vanilla planifolia ».
--
-- 🔴 CE QUI RESTE VOLONTAIREMENT SANS AFFICHE. Vingt evenements ne sont pas
--    illustres : les fetes generiques (Noel, Paques, Toussaint, Fete du
--    Travail) parce qu'un sapin pris ailleurs n'apprend rien et laisse croire
--    a une photo malgache, et les festivals recents parce que Commons n'a
--    rien de libre. Six autres ont ete refusees A L'OEIL apres que les
--    filtres les eurent acceptees : un cirque de gres pour une ceremonie
--    royale, une page d'album d'archives pour une moisson, un pigeon du ZOO
--    DE ZURICH pour des oiseaux endemiques sauvages. Motifs dans
--    scripts/evenements_refuses.py.
-- ==========================================================================

do $$
begin
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/agr-gation-de-requins-baleines-nosy-be.jpg', poster_credit = 'Charles J. Sharp', poster_licence = 'CC BY-SA 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Whale_shark,_Nosy_Sakatia,_Nosy_Be,_Madagascar.jpg' where id = 'ce254ced-9b84-4aad-8a8c-8eea101f5c63'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/campagne-de-la-vanille-verte.jpg', poster_credit = 'Diego Delso', poster_licence = 'CC BY-SA 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Vainilla_(Vanilla_planifolia),_Ampasipohy,_Nosy_Be,_Madagascar,_2025-09-21,_DD_25.jpg' where id = '7bf5171b-b323-4e78-81ec-1f542379e874'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/campagne-du-girofle.jpg', poster_credit = 'Yosri at ms.wikipedia', poster_licence = 'GFDL', poster_source = 'https://commons.wikimedia.org/wiki/File:YosriCengkih.jpg' where id = '34fe7f66-2bfa-4cd0-87fd-847945b95d69'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/campagne-du-litchi.jpg', poster_credit = 'Krzysztof Ziarnek, Kenraiz', poster_licence = 'CC BY 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Litchi_chinensis_%27Brewster%27_kz01.jpg' where id = '7b5d69bd-3dbd-4b15-ba52-9214840ebe94'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/famadihana-le-retournement-des-morts.jpg', poster_credit = 'Eric rakotomalala', poster_licence = 'CC BY-SA 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Famadihana.JPG' where id = '6509241c-53c7-4888-ace2-11ec47330d39'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/festival-s-rogno-cacao.jpg', poster_credit = 'ZAFITSOA', poster_licence = 'CC BY 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Cabosses_de_cacao,_Madagascar.jpg' where id = 'c1a9329d-bee5-4d02-841a-64b9118665d2'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/floraison-des-jacarandas-d-antananarivo.jpg', poster_credit = 'Salym Fayad', poster_licence = 'CC BY-SA 2.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Beautiful_jacaranda_Antananarivo_Madagascar.jpg' where id = 'b88dda9f-2e80-4308-ba91-089b8ab81a99'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/floraison-nocturne-des-baobabs-de-grandidier.jpg', poster_credit = 'Olivier Lejade', poster_licence = 'CC BY-SA 2.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Adansonia_grandidieri_Morondava_-_08.jpg' where id = '2ebae926-efa4-44f5-8b6c-198f96514cef'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/march-aux-z-bus-d-ambalavao-tsienimparihy.jpg', poster_credit = 'JialiangGao www.peace-on-earth.org', poster_licence = 'CC BY-SA 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Zebu_Market_Ambalavao_Madagascar.jpg' where id = '36158fc0-1521-4e0b-b4ae-6e555c1ca57d'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/naissances-des-l-muriens-catta.jpg', poster_credit = 'Alex Dunkel ( Maky )', poster_licence = 'CC BY 3.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Lemur_catta_001.jpg' where id = '00867097-bf4a-4184-9605-940b7f4036d8'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/saison-cyclonique-du-sud-ouest-de-l-oc-an-indien.jpg', poster_credit = 'National Aeronautics and Space Administration, LANCE/EOSDIS Rapid Response, captured on Suomi NPP satellite', poster_licence = 'Public domain', poster_source = 'https://commons.wikimedia.org/wiki/File:Enawo_2017-03-03_0954Z.jpg' where id = '1a9521fb-106d-4491-ae54-eb4594ff94bb'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/saison-des-baleines-bosse-c-te-est.jpg', poster_credit = 'Lemurbaby', poster_licence = 'CC BY-SA 3.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Humpback_whale_Sainte_Marie_Madagascar_July_2013.JPG' where id = 'df92460e-e3c7-4cb2-ba29-77140c31c8d1'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/saison-du-savika-rod-o-betsileo.jpg', poster_credit = 'HitaNdanou24', poster_licence = 'CC0', poster_source = 'https://commons.wikimedia.org/wiki/File:Savika_Fianarantsoa_01.jpg' where id = '3672de3e-3684-481e-84f5-881e1e1f7ecb'::uuid;
  update public.events set poster_url = 'https://diako.fonenako.mg/uploads/pages/evenements/saison-s-che-hiver-austral.jpg', poster_credit = 'Anai171', poster_licence = 'CC BY-SA 4.0', poster_source = 'https://commons.wikimedia.org/wiki/File:Baobab_taill%C3%A9_%C3%A0_Andavadoaka,_r%C3%A9gion_Atsimo-Andrefana,_Madagascar.jpg' where id = 'af5a11f5-5f24-4ad6-8e64-936bc780c6f4'::uuid;
end $$;

-- ⚠ L'ASSERTION PORTE SUR L'ATTRIBUTION. Une affiche Commons sans auteur ni
--   licence n'est pas une image gratuite, c'est une infraction silencieuse.
do $$
declare n int;
begin
  select count(*) into n from public.events
   where poster_url is not null
     and (poster_credit is null or poster_licence is null or poster_source is null);
  if n > 0 then
    raise exception 'ATTRIBUTION MANQUANTE sur % affiche(s)', n;
  end if;
end $$;
