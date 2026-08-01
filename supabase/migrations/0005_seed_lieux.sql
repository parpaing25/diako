-- ============================================================================
-- 0005 — GARNISSAGE DU RÉFÉRENTIEL DES LIEUX
--
-- ~140 lieux : le pays, ses régions, les villes, les zones touristiques, les
-- parcs, les îles, et les quartiers d'Antananarivo (sans eux, « un restaurant
-- à Isoraka » est impossible).
--
-- ⚠ HONNÊTETÉ DES COORDONNÉES — lat/lng n'est renseigné que là où la position
--   est sûre au kilomètre près. Ailleurs c'est NULL, assumé. Une coordonnée
--   inventée est pire qu'absente : elle a l'air d'une donnée, elle se propage
--   dans les calculs de distance, et personne ne va la vérifier. radius_km
--   absorbe l'imprécision restante — un lieu touristique malgache est une
--   zone, pas un point.
--
-- Idempotent : on conflict (slug) do update. Le fichier peut être rejoué.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LE PAYS ET LES RÉGIONS
-- ────────────────────────────────────────────────────────────────────────────
insert into public.places (slug, name_fr, name_mg, kind, region, is_touristique, radius_km) values
  ('madagascar', 'Madagascar', 'Madagasikara', 'pays', null, true, 800)
on conflict (slug) do update set name_fr = excluded.name_fr;

insert into public.places (slug, name_fr, kind, region, radius_km) values
  ('analamanga',        'Analamanga',        'region', 'Analamanga',        60),
  ('vakinankaratra',    'Vakinankaratra',    'region', 'Vakinankaratra',    70),
  ('itasy',             'Itasy',             'region', 'Itasy',             50),
  ('bongolava',         'Bongolava',         'region', 'Bongolava',         70),
  ('haute-matsiatra',   'Haute Matsiatra',   'region', 'Haute Matsiatra',   70),
  ('amoron-i-mania',    'Amoron''i Mania',   'region', 'Amoron''i Mania',   60),
  ('vatovavy',          'Vatovavy',          'region', 'Vatovavy',          60),
  ('fitovinany',        'Fitovinany',        'region', 'Fitovinany',        60),
  ('atsimo-atsinanana', 'Atsimo-Atsinanana', 'region', 'Atsimo-Atsinanana', 70),
  ('ihorombe',          'Ihorombe',          'region', 'Ihorombe',          80),
  ('menabe',            'Menabe',            'region', 'Menabe',            100),
  ('melaky',            'Melaky',            'region', 'Melaky',            100),
  ('atsimo-andrefana',  'Atsimo-Andrefana',  'region', 'Atsimo-Andrefana',  120),
  ('androy',            'Androy',            'region', 'Androy',            80),
  ('anosy',             'Anosy',             'region', 'Anosy',             80),
  ('alaotra-mangoro',   'Alaotra-Mangoro',   'region', 'Alaotra-Mangoro',   80),
  ('atsinanana',        'Atsinanana',        'region', 'Atsinanana',        80),
  ('analanjirofo',      'Analanjirofo',      'region', 'Analanjirofo',      80),
  ('boeny',             'Boeny',             'region', 'Boeny',             90),
  ('sofia',             'Sofia',             'region', 'Sofia',             100),
  ('betsiboka',         'Betsiboka',         'region', 'Betsiboka',         80),
  ('diana',             'Diana',             'region', 'Diana',             80),
  ('sava',              'Sava',              'region', 'Sava',              90)
on conflict (slug) do update set name_fr = excluded.name_fr;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LES GRANDES VILLES
--
-- Ce sont elles qui portent les alias décisifs : personne à Madagascar ne dit
-- « Antsiranana », tout le monde dit « Diego ».
-- ────────────────────────────────────────────────────────────────────────────
insert into public.places
  (slug, name_fr, name_mg, kind, region, axe, lat, lng, radius_km, is_touristique, summary) values
  ('antananarivo', 'Antananarivo', 'Antananarivo', 'ville', 'Analamanga', 'hautes-terres',
     -18.8792, 47.5079, 15, true,
     'La capitale, sur ses douze collines. Point de départ de tous les axes, et la ville où l''offre de restaurants est de loin la plus fournie du pays.'),
  ('toamasina', 'Toamasina', 'Toamasina', 'ville', 'Atsinanana', 'est',
     -18.1492, 49.4023, 12, true,
     'Le grand port de l''est, à 350 km de la capitale par la RN2. Porte d''entrée vers Sainte-Marie et la côte des épices.'),
  ('mahajanga', 'Mahajanga', 'Mahajanga', 'ville', 'Boeny', null,
     -15.7167, 46.3167, 12, true,
     'La ville du bord de mer et du baobab du front de mer. Longue plage, eau chaude toute l''année, et la destination de vacances familiale par excellence des Tananariviens.'),
  ('toliara', 'Toliara', 'Toliara', 'ville', 'Atsimo-Andrefana', 'rn7-sud',
     -23.3500, 43.6667, 12, true,
     'Le bout de la RN7, au bord du canal du Mozambique. Base de départ vers Ifaty, Anakao et le grand récif.'),
  ('antsiranana', 'Antsiranana', 'Antsiranana', 'ville', 'Diana', 'nord',
     -12.2787, 49.2917, 12, true,
     'Diego-Suarez, au fond de la deuxième plus grande baie du monde. Base des Trois Baies, de la Mer d''Émeraude et de la Montagne d''Ambre.'),
  ('fianarantsoa', 'Fianarantsoa', 'Fianarantsoa', 'ville', 'Haute Matsiatra', 'rn7-sud',
     -21.4536, 47.0854, 10, true,
     'La ville betsileo, capitale du vin malgache et terminus du train vers Manakara.'),
  ('taolagnaro', 'Taolagnaro', 'Taolagnaro', 'ville', 'Anosy', 'extreme-sud',
     -25.0319, 46.9853, 12, true,
     'Fort-Dauphin, entre montagne et océan. Le point où la forêt humide et le désert épineux se rejoignent.'),
  ('antsirabe', 'Antsirabe', 'Antsirabe', 'ville', 'Vakinankaratra', 'rn7-sud',
     -19.8659, 47.0333, 10, true,
     'La ville d''eau, ses pousse-pousse et ses maisons coloniales. Première étape de la RN7 depuis Tana.'),
  ('morondava', 'Morondava', 'Morondava', 'ville', 'Menabe', 'ouest-baobabs',
     -20.2833, 44.2833, 12, true,
     'La ville du couchant, à vingt minutes de l''Allée des Baobabs.'),
  ('manakara', 'Manakara', 'Manakara', 'ville', 'Fitovinany', 'sud-est',
     -22.1333, 48.0167, 10, true, 'Terminus du train FCE, entre canal des Pangalanes et océan.'),
  ('mananjary', 'Mananjary', 'Mananjary', 'ville', 'Vatovavy', 'sud-est',
     -21.2167, 48.3333, 10, false, null),
  ('farafangana', 'Farafangana', 'Farafangana', 'ville', 'Atsimo-Atsinanana', 'sud-est',
     -22.8167, 47.8333, 10, false, null),
  ('sambava', 'Sambava', 'Sambava', 'ville', 'Sava', 'sava',
     -14.2667, 50.1667, 10, true, 'La capitale mondiale de la vanille, entre cocoteraies et océan.'),
  ('antalaha', 'Antalaha', 'Antalaha', 'ville', 'Sava', 'sava',
     -14.9000, 50.2833, 10, true, 'Port vanillier et porte sud du Masoala.'),
  ('andapa', 'Andapa', 'Andapa', 'ville', 'Sava', 'sava',
     -14.6500, 49.6500, 10, true, 'Cuvette rizicole cernée de forêt, à l''entrée du Marojejy.'),
  ('vohemar', 'Vohémar', 'Iharana', 'ville', 'Sava', 'sava',
     -13.3667, 50.0000, 10, false, null),
  ('maroantsetra', 'Maroantsetra', 'Maroantsetra', 'ville', 'Analanjirofo', 'est',
     -15.4333, 49.7333, 10, true, 'Au fond de la baie d''Antongil. Porte du Masoala et de Nosy Mangabe.'),
  ('ambanja', 'Ambanja', 'Ambanja', 'ville', 'Diana', 'nord',
     -13.6833, 48.4500, 10, false, 'Vallée du Sambirano : cacao, ylang-ylang et poivre.'),
  ('ambatondrazaka', 'Ambatondrazaka', 'Ambatondrazaka', 'ville', 'Alaotra-Mangoro', null,
     -17.8333, 48.4167, 10, false, 'Le grenier à riz de Madagascar, au bord du lac Alaotra.'),
  ('moramanga', 'Moramanga', 'Moramanga', 'ville', 'Alaotra-Mangoro', 'est',
     -18.9500, 48.2000, 8, false, null),
  ('ambositra', 'Ambositra', 'Ambositra', 'ville', 'Amoron''i Mania', 'rn7-sud',
     -20.5300, 47.2500, 8, true, 'La ville du bois sculpté, porte du pays zafimaniry.'),
  ('ambalavao', 'Ambalavao', 'Ambalavao', 'ville', 'Haute Matsiatra', 'rn7-sud',
     -21.8333, 46.9333, 8, true,
     'Le papier antemoro, le marché aux zébus du mercredi et la réserve d''Anja juste à côté.'),
  ('ihosy', 'Ihosy', 'Ihosy', 'ville', 'Ihorombe', 'rn7-sud',
     -22.4000, 46.1167, 8, false, 'Carrefour du sud : la RN7 continue vers Toliara, la RN13 descend vers Fort-Dauphin.'),
  ('ambovombe', 'Ambovombe', 'Ambovombe', 'ville', 'Androy', 'extreme-sud',
     -25.1667, 46.0833, 8, false, null),
  ('ambatolampy', 'Ambatolampy', 'Ambatolampy', 'ville', 'Vakinankaratra', 'rn7-sud',
     -19.3833, 47.4167, 8, false, 'Les marmites en aluminium coulé et le pied de l''Ankaratra.'),
  ('antsohihy', 'Antsohihy', 'Antsohihy', 'ville', 'Sofia', null,
     -14.8833, 47.9833, 8, false, null),
  ('maintirano', 'Maintirano', 'Maintirano', 'ville', 'Melaky', 'ouest-baobabs',
     -18.0667, 44.0333, 8, false, null),
  ('morombe', 'Morombe', 'Morombe', 'ville', 'Atsimo-Andrefana', null,
     -21.7500, 43.3667, 8, false, null),
  ('tsiroanomandidy', 'Tsiroanomandidy', 'Tsiroanomandidy', 'ville', 'Bongolava', null,
     -18.7667, 46.0333, 8, false, null),
  ('miarinarivo', 'Miarinarivo', 'Miarinarivo', 'ville', 'Itasy', null,
     -19.0000, 46.9000, 8, false, null),
  ('arivonimamo', 'Arivonimamo', 'Arivonimamo', 'ville', 'Itasy', null,
     -19.0167, 47.1833, 8, false, null),
  ('miandrivazo', 'Miandrivazo', 'Miandrivazo', 'ville', 'Menabe', 'ouest-baobabs',
     -19.5167, 45.4500, 8, true, 'Le départ de la descente en pirogue sur la Tsiribihina.'),
  ('vangaindrano', 'Vangaindrano', 'Vangaindrano', 'ville', 'Atsimo-Atsinanana', 'sud-est',
     -23.3500, 47.6000, 8, false, null),
  ('ampanihy', 'Ampanihy', 'Ampanihy', 'ville', 'Atsimo-Andrefana', 'extreme-sud',
     -24.7000, 44.7500, 8, false, 'Le pays du mohair et des tapis tissés.'),
  ('betioky', 'Betioky', 'Betioky', 'ville', 'Atsimo-Andrefana', null,
     -23.7167, 44.3833, 8, false, null),
  ('tsihombe', 'Tsihombe', 'Tsihombe', 'ville', 'Androy', 'extreme-sud',
     -25.3167, 45.4833, 8, false, null),
  ('marovoay', 'Marovoay', 'Marovoay', 'ville', 'Boeny', null,
     -16.1000, 46.6333, 8, false, null),
  ('port-berge', 'Port-Bergé', 'Boriziny', 'ville', 'Sofia', null,
     -15.5667, 47.6167, 8, false, null),
  ('soalala', 'Soalala', 'Soalala', 'ville', 'Boeny', null,
     -16.1000, 45.3667, 8, false, null),
  ('besalampy', 'Besalampy', 'Besalampy', 'ville', 'Melaky', null,
     -16.7500, 44.4833, 8, false, null),
  ('manja', 'Manja', 'Manja', 'ville', 'Menabe', null,
     -21.4167, 44.3167, 8, false, null),
  ('vatomandry', 'Vatomandry', 'Vatomandry', 'ville', 'Atsinanana', 'est',
     -19.3333, 48.9833, 8, false, null),
  ('fenoarivo-atsinanana', 'Fénérive Est', 'Fenoarivo Atsinanana', 'ville', 'Analanjirofo', 'est',
     -17.3833, 49.4167, 8, false, null)
on conflict (slug) do update set
  name_fr = excluded.name_fr, name_mg = excluded.name_mg, lat = excluded.lat,
  lng = excluded.lng, summary = excluded.summary, is_touristique = excluded.is_touristique;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LES ZONES TOURISTIQUES, ÎLES, PLAGES, PARCS ET SITES
--
-- C'est ici que se joue la promesse « un hôtel à Ampefy » : ces lieux ne sont
-- pas des communes administratives, ce sont les noms que les gens emploient.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.places
  (slug, name_fr, name_mg, kind, region, axe, lat, lng, radius_km, is_touristique, summary, why_go) values
  ('nosy-be', 'Nosy Be', 'Nosy Be', 'ile', 'Diana', 'nord',
     -13.3167, 48.2667, 20, true,
     'L''île aux parfums : ylang-ylang, plages au sable clair et l''archipel juste en face.',
     array['Les plages d''Andilana et de Madirokely', 'L''archipel : Komba, Sakatia, Tanikely, Iranja', 'Les requins-baleines d''octobre à décembre']),
  ('hell-ville', 'Hell-Ville', 'Andoany', 'ville', 'Diana', 'nord',
     -13.4000, 48.2667, 5, true, 'Le chef-lieu de Nosy Be, son marché et son port.', null),
  ('ambatoloaka', 'Ambatoloaka', 'Ambatoloaka', 'plage', 'Diana', 'nord',
     -13.3833, 48.2333, 3, true, 'Le village le plus animé de Nosy Be, restaurants les pieds dans l''eau.', null),
  ('andilana', 'Andilana', 'Andilana', 'plage', 'Diana', 'nord',
     -13.2333, 48.2333, 3, true, 'La plus belle plage de Nosy Be, au nord-ouest de l''île.', null),
  ('nosy-komba', 'Nosy Komba', 'Nosy Komba', 'ile', 'Diana', 'nord',
     -13.4667, 48.3500, 5, true, 'L''île aux lémuriens, entre Nosy Be et la grande terre.', null),
  ('nosy-tanikely', 'Nosy Tanikely', 'Nosy Tanikely', 'ile', 'Diana', 'nord',
     -13.4833, 48.2333, 2, true, 'Réserve marine : le meilleur masque-tuba accessible en une demi-journée.', null),
  ('nosy-iranja', 'Nosy Iranja', 'Nosy Iranja', 'ile', 'Diana', 'nord',
     -13.6000, 47.8333, 3, true, 'Deux îlots reliés par un banc de sable blanc, site de ponte des tortues.', null),
  ('nosy-sakatia', 'Nosy Sakatia', 'Nosy Sakatia', 'ile', 'Diana', 'nord',
     -13.3167, 48.1667, 3, true, 'L''île aux orchidées, et les tortues vertes qu''on croise au tuba.', null),
  ('nosy-mitsio', 'Nosy Mitsio', 'Nosy Mitsio', 'ile', 'Diana', 'nord',
     null, null, 8, true, 'Archipel isolé au nord de Nosy Be, pour la voile et la plongée.', null),
  ('ankify', 'Ankify', 'Ankify', 'site', 'Diana', 'nord',
     -13.6167, 48.3500, 3, false, 'L''embarcadère pour Nosy Be depuis la grande terre.', null),
  ('nosy-boraha', 'Sainte-Marie', 'Nosy Boraha', 'ile', 'Analanjirofo', 'est',
     -17.0000, 49.8500, 25, true,
     'L''île longue et verte de la côte est : cocotiers, cimetière des pirates et les baleines à bosse de juillet à septembre.',
     array['Les baleines à bosse de juillet à septembre', 'L''île aux Nattes, au sud', 'Le cimetière des pirates et la piscine naturelle']),
  ('ambodifotatra', 'Ambodifotatra', 'Ambodifotatra', 'ville', 'Analanjirofo', 'est',
     -17.0167, 49.8500, 4, true, 'Le chef-lieu de Sainte-Marie.', null),
  ('ile-aux-nattes', 'Île aux Nattes', 'Nosy Nato', 'ile', 'Analanjirofo', 'est',
     -17.1167, 49.8333, 3, true,
     'À cinq minutes de pirogue de la pointe sud de Sainte-Marie : pas de voiture, du sable et des cocotiers.', null),
  ('foulpointe', 'Foulpointe', 'Mahavelona', 'plage', 'Atsinanana', 'est',
     -17.6833, 49.5000, 5, true, 'Lagon protégé par une barrière de corail, la plage de week-end des Tamataviens.', null),
  ('mahambo', 'Mahambo', 'Mahambo', 'plage', 'Analanjirofo', 'est',
     -17.4833, 49.4667, 4, true, 'Plage bordée de filaos, spot de surf le plus régulier de la côte est.', null),
  ('canal-des-pangalanes', 'Canal des Pangalanes', 'Ampangalana', 'site', 'Atsinanana', 'est',
     null, null, 60, true, 'Six cents kilomètres de lagunes et de canaux parallèles à la côte est.', null),
  ('ampefy', 'Ampefy', 'Ampefy', 'zone_touristique', 'Itasy', 'hautes-terres',
     -19.0333, 46.7167, 12, true,
     'Le lac Itasy, les geysers d''Analavory et la chute de la Lily, à deux heures et demie de Tana.',
     array['La chute de la Lily', 'Les geysers d''Analavory', 'L''île de la Vierge sur le lac']),
  ('analavory', 'Analavory', 'Analavory', 'commune', 'Itasy', 'hautes-terres',
     -19.0000, 46.7000, 6, true, 'Les geysers, à quelques kilomètres d''Ampefy.', null),
  ('lac-itasy', 'Lac Itasy', 'Farihy Itasy', 'site', 'Itasy', 'hautes-terres',
     -19.0667, 46.8000, 10, true, 'Le troisième lac du pays, dans un cirque volcanique.', null),
  ('mantasoa', 'Mantasoa', 'Mantasoa', 'zone_touristique', 'Analamanga', 'hautes-terres',
     -19.0167, 47.8333, 8, true, 'Le lac de barrage à une heure et demie de Tana, base nautique et forêt de pins.', null),
  ('andasibe', 'Andasibe', 'Andasibe', 'zone_touristique', 'Alaotra-Mangoro', 'est',
     -18.9333, 48.4167, 8, true,
     'Le parc de l''indri, le plus grand lémurien vivant, à trois heures de route de la capitale.',
     array['Le chant de l''indri au petit matin', 'La visite de nuit sur la route forestière', 'Accessible en une journée depuis Tana']),
  ('analamazaotra', 'Analamazaotra', 'Analamazaotra', 'parc', 'Alaotra-Mangoro', 'est',
     -18.9333, 48.4167, 5, true, 'La réserve d''Andasibe, celle où l''on entend l''indri.', null),
  ('mantadia', 'Mantadia', 'Mantadia', 'parc', 'Alaotra-Mangoro', 'est',
     -18.8000, 48.4333, 10, true, 'La partie haute et sauvage du parc d''Andasibe.', null),
  ('ranomafana', 'Ranomafana', 'Ranomafana', 'parc', 'Vatovavy', 'rn7-sud',
     -21.2500, 47.4500, 10, true,
     'Forêt pluviale de moyenne altitude, thermes et douze espèces de lémuriens.', null),
  ('isalo', 'Isalo', 'Isalo', 'parc', 'Ihorombe', 'rn7-sud',
     -22.5500, 45.3500, 25, true,
     'Massif de grès ruiniforme, canyons et piscines naturelles : le parc le plus visité du pays.',
     array['La piscine naturelle et la piscine bleue', 'Le canyon des Makis', 'La fenêtre de l''Isalo au coucher du soleil']),
  ('ranohira', 'Ranohira', 'Ranohira', 'ville', 'Ihorombe', 'rn7-sud',
     -22.5500, 45.4000, 6, true, 'Le village d''entrée du parc de l''Isalo, sur la RN7.', null),
  ('anja', 'Réserve d''Anja', 'Anja', 'parc', 'Haute Matsiatra', 'rn7-sud',
     -21.8500, 46.8500, 4, true, 'Réserve communautaire au pied des Trois Sœurs, pleine de makis catta.', null),
  ('andringitra', 'Andringitra', 'Andringitra', 'parc', 'Haute Matsiatra', 'rn7-sud',
     -22.2000, 46.8833, 20, true, 'Le deuxième sommet du pays et les plus belles randonnées de Madagascar.', null),
  ('tsaranoro', 'Vallée du Tsaranoro', 'Tsaranoro', 'zone_touristique', 'Haute Matsiatra', 'rn7-sud',
     -22.0833, 46.7667, 8, true, 'Une paroi de granit de 800 mètres au-dessus d''une vallée betsileo.', null),
  ('ifaty', 'Ifaty', 'Ifaty', 'plage', 'Atsimo-Andrefana', 'rn7-sud',
     -23.1500, 43.6167, 6, true,
     'Village de pêcheurs vezo à 25 km au nord de Toliara, devant le grand récif.', null),
  ('mangily', 'Mangily', 'Mangily', 'plage', 'Atsimo-Andrefana', 'rn7-sud',
     -23.1167, 43.5833, 4, true, 'La partie hôtelière d''Ifaty, la forêt de baobabs juste derrière.', null),
  ('anakao', 'Anakao', 'Anakao', 'plage', 'Atsimo-Andrefana', 'rn7-sud',
     -23.6500, 43.6500, 6, true, 'Village vezo au sud de Toliara, accessible en bateau. Lagon et pirogues à balancier.', null),
  ('nosy-ve', 'Nosy Ve', 'Nosy Ve', 'ile', 'Atsimo-Andrefana', 'rn7-sud',
     -23.6500, 43.5833, 2, true, 'Îlot sacré au large d''Anakao, colonie de pailles-en-queue.', null),
  ('salary', 'Salary', 'Salary', 'plage', 'Atsimo-Andrefana', null,
     null, null, 5, true, 'Longue plage isolée au nord d''Ifaty, sur la piste de Morombe.', null),
  ('tulear-recif', 'Grand récif de Toliara', 'Grand récif', 'site', 'Atsimo-Andrefana', 'rn7-sud',
     null, null, 30, true, 'L''un des plus grands systèmes récifaux de l''océan Indien.', null),
  ('allee-des-baobabs', 'Allée des Baobabs', 'Ny lalan''ny reniala', 'site', 'Menabe', 'ouest-baobabs',
     -20.2500, 44.4167, 3, true,
     'Une vingtaine de baobabs Grandidier alignés sur la piste de Belo, au coucher du soleil.', null),
  ('kirindy', 'Forêt de Kirindy', 'Kirindy', 'parc', 'Menabe', 'ouest-baobabs',
     -20.0667, 44.6667, 10, true, 'Forêt sèche : fossa, microcèbes et sortie de nuit.', null),
  ('belo-sur-mer', 'Belo-sur-Mer', 'Belo sur Mer', 'plage', 'Menabe', 'ouest-baobabs',
     -20.7333, 44.0000, 8, true, 'Village de charpentiers de marine et de sauniers, au bout de la piste.', null),
  ('tsingy-de-bemaraha', 'Tsingy de Bemaraha', 'Tsingin''i Bemaraha', 'parc', 'Melaky', 'ouest-baobabs',
     -19.1333, 44.8167, 25, true,
     'Une cathédrale de calcaire taillée en lames. Classé au patrimoine mondial, fermé en saison des pluies.', null),
  ('bekopaka', 'Bekopaka', 'Bekopaka', 'commune', 'Melaky', 'ouest-baobabs',
     -19.1333, 44.8167, 5, true, 'Le village d''accès aux Tsingy de Bemaraha.', null),
  ('tsiribihina', 'Tsiribihina', 'Tsiribihina', 'site', 'Menabe', 'ouest-baobabs',
     null, null, 60, true, 'Trois jours de descente en pirogue de Miandrivazo à Belo-sur-Tsiribihina.', null),
  ('montagne-d-ambre', 'Montagne d''Ambre', 'Ambohitra', 'parc', 'Diana', 'nord',
     -12.5333, 49.1667, 12, true, 'Forêt humide d''altitude, cascades et caméléons nains, à une heure de Diego.', null),
  ('joffreville', 'Joffreville', 'Ambohitra', 'commune', 'Diana', 'nord',
     -12.4833, 49.2000, 4, true, 'Le village colonial à l''entrée de la Montagne d''Ambre.', null),
  ('ankarana', 'Ankarana', 'Ankarana', 'parc', 'Diana', 'nord',
     -12.9000, 49.1167, 20, true, 'Tsingy, grottes et rivières souterraines, sur la route entre Diego et Ambanja.', null),
  ('ramena', 'Ramena', 'Ramena', 'plage', 'Diana', 'nord',
     -12.2333, 49.3667, 4, true, 'La plage de Diego, à l''entrée de la baie.', null),
  ('mer-d-emeraude', 'Mer d''Émeraude', 'Ranomasina maitso', 'site', 'Diana', 'nord',
     -12.2000, 49.4333, 5, true, 'Un lagon turquoise abrité par une barrière, en boutre depuis Ramena.', null),
  ('trois-baies', 'Les Trois Baies', 'Helodrano telo', 'site', 'Diana', 'nord',
     -12.2667, 49.4000, 10, true, 'Sakalava, Pigeons et Dunes : le spot de kite et de windsurf du nord.', null),
  ('baie-de-sakalava', 'Baie de Sakalava', 'Sakalava', 'plage', 'Diana', 'nord',
     -12.2667, 49.3833, 3, true, 'Vent régulier d''avril à novembre : le rendez-vous des kitesurfeurs.', null),
  ('nosy-hara', 'Nosy Hara', 'Nosy Hara', 'ile', 'Diana', 'nord',
     null, null, 8, true, 'Parc marin au nord-ouest de Diego, îlots calcaires et plages désertes.', null),
  ('masoala', 'Masoala', 'Masoala', 'parc', 'Sava', 'est',
     -15.5000, 50.0000, 40, true,
     'La plus grande aire protégée du pays : forêt humide qui descend jusqu''à la mer.', null),
  ('nosy-mangabe', 'Nosy Mangabe', 'Nosy Mangabe', 'ile', 'Analanjirofo', 'est',
     -15.5000, 49.7667, 3, true, 'Îlot forestier dans la baie d''Antongil, refuge de l''aye-aye.', null),
  ('marojejy', 'Marojejy', 'Marojejy', 'parc', 'Sava', 'sava',
     -14.4333, 49.7333, 20, true, 'Massif de forêt primaire, patrimoine mondial, et le propithèque soyeux.', null),
  ('ankarafantsika', 'Ankarafantsika', 'Ankarafantsika', 'parc', 'Boeny', null,
     -16.3000, 46.8167, 20, true, 'Forêt sèche et lac Ravelobe, sur la RN4 entre Tana et Majunga.', null),
  ('cirque-rouge', 'Cirque Rouge', 'Cirque Rouge', 'site', 'Boeny', null,
     -15.6833, 46.3500, 3, true, 'Un amphithéâtre de latérite ravinée, à un quart d''heure de Majunga.', null),
  ('grotte-d-anjohibe', 'Grottes d''Anjohibe', 'Anjohibe', 'site', 'Boeny', null,
     -15.5333, 46.8833, 5, true, 'Cinq kilomètres de galeries et de concrétions, à 80 km de Majunga.', null),
  ('katsepy', 'Katsepy', 'Katsepy', 'commune', 'Boeny', null,
     -15.7667, 46.2333, 5, true, 'De l''autre côté de la baie de Bombetoka, en bac depuis Majunga.', null),
  ('lac-alaotra', 'Lac Alaotra', 'Farihy Alaotra', 'site', 'Alaotra-Mangoro', null,
     -17.5333, 48.5167, 30, true, 'Le plus grand lac du pays et son bandro, lémurien des roseaux.', null),
  ('ambohimanga', 'Ambohimanga', 'Ambohimanga', 'site', 'Analamanga', 'hautes-terres',
     -18.7583, 47.5622, 3, true, 'La colline royale, patrimoine mondial, à 20 km de Tana.', null),
  ('zafimaniry', 'Pays Zafimaniry', 'Zafimaniry', 'zone_touristique', 'Amoron''i Mania', 'rn7-sud',
     null, null, 25, true, 'Villages de sculpteurs sur bois, art inscrit au patrimoine immatériel.', null),
  ('antoetra', 'Antoetra', 'Antoetra', 'commune', 'Amoron''i Mania', 'rn7-sud',
     null, null, 5, true, 'La porte d''entrée du pays zafimaniry, depuis Ambositra.', null),
  ('berenty', 'Réserve de Berenty', 'Berenty', 'parc', 'Anosy', 'extreme-sud',
     -25.0000, 46.3000, 5, true, 'Forêt-galerie de tamariniers et makis catta, à 80 km de Fort-Dauphin.', null),
  ('sainte-luce', 'Sainte-Luce', 'Manafiafy', 'plage', 'Anosy', 'extreme-sud',
     -24.7833, 47.1667, 5, true, 'Baie abritée et forêt littorale au nord de Fort-Dauphin.', null),
  ('lokaro', 'Lokaro', 'Lokaro', 'plage', 'Anosy', 'extreme-sud',
     -24.9000, 47.1500, 5, true, 'Presqu''île et lagunes, en pirogue depuis Fort-Dauphin.', null),
  ('nahampoana', 'Nahampoana', 'Nahampoana', 'parc', 'Anosy', 'extreme-sud',
     -24.9833, 46.9833, 3, true, 'Réserve privée à sept kilomètres de Fort-Dauphin.', null),
  ('pic-saint-louis', 'Pic Saint-Louis', 'Pic Saint-Louis', 'site', 'Anosy', 'extreme-sud',
     -25.0000, 47.0000, 3, true, 'Cinq cent vingt-neuf mètres au-dessus de Fort-Dauphin.', null),
  ('lavanono', 'Lavanono', 'Lavanono', 'plage', 'Androy', 'extreme-sud',
     -25.4167, 44.9333, 4, true, 'Spot de surf au bout du monde, sur la côte sud.', null),
  ('cap-sainte-marie', 'Cap Sainte-Marie', 'Tanjona Vohimena', 'site', 'Androy', 'extreme-sud',
     -25.5833, 45.1667, 5, true, 'La pointe la plus au sud de Madagascar, falaises et tortues radiées.', null),
  ('tsimanampetsotsa', 'Tsimanampetsotsa', 'Tsimanampetsotsa', 'parc', 'Atsimo-Andrefana', null,
     -24.1167, 43.7500, 15, true, 'Lac salé, flamants roses et forêt épineuse.', null),
  ('zombitse', 'Zombitse-Vohibasia', 'Zombitse', 'parc', 'Atsimo-Andrefana', 'rn7-sud',
     -22.8833, 44.6833, 10, true, 'Forêt de transition traversée par la RN7, entre Isalo et Toliara.', null),
  ('mananara-nord', 'Mananara Nord', 'Mananara Avaratra', 'parc', 'Analanjirofo', 'est',
     null, null, 15, true, 'Réserve de biosphère : forêt, îles et récifs.', null),
  ('nosy-lava', 'Nosy Lava', 'Nosy Lava', 'ile', 'Sofia', null,
     null, null, 4, false, 'Ancien bagne insulaire au large d''Analalava.', null)
on conflict (slug) do update set
  name_fr = excluded.name_fr, name_mg = excluded.name_mg, lat = excluded.lat,
  lng = excluded.lng, summary = excluded.summary, why_go = excluded.why_go,
  is_touristique = excluded.is_touristique;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. LES QUARTIERS D'ANTANANARIVO
--
-- Indispensables : à Tana, on ne cherche pas « un restaurant à Antananarivo »,
-- on cherche « un restaurant à Isoraka ». C'est le quartier qui porte le sens,
-- exactement comme dans le projet frère.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.places (slug, name_fr, kind, region, radius_km, parent_id)
select v.slug, v.nom, 'quartier', 'Analamanga', 2, p.id
from (values
  ('analakely', 'Analakely'), ('isoraka', 'Isoraka'), ('antaninarenina', 'Antaninarenina'),
  ('ambatonakanga', 'Ambatonakanga'), ('behoririka', 'Behoririka'), ('antanimena', 'Antanimena'),
  ('andravoahangy', 'Andravoahangy'), ('ankorondrano', 'Ankorondrano'), ('ivandry', 'Ivandry'),
  ('ambodivona', 'Ambodivona'), ('ambatobe', 'Ambatobe'), ('analamahitsy', 'Analamahitsy'),
  ('ivato', 'Ivato'), ('andraharo', 'Andraharo'), ('ampefiloha', 'Ampefiloha'),
  ('anosy-tana', 'Anosy'), ('mahamasina', 'Mahamasina'), ('tsimbazaza', 'Tsimbazaza'),
  ('ambohijatovo', 'Ambohijatovo'), ('ambanidia', 'Ambanidia'), ('ambohipo', 'Ambohipo'),
  ('ankatso', 'Ankatso'), ('itaosy', 'Itaosy'), ('tanjombato', 'Tanjombato'),
  ('ambohibao', 'Ambohibao'), ('alarobia', 'Alarobia'), ('andoharanofotsy', 'Andoharanofotsy'),
  ('isotry', 'Isotry'), ('andavamamba', 'Andavamamba'), ('ambohimanarina', 'Ambohimanarina'),
  ('talatamaty', 'Talatamaty'), ('ilafy', 'Ilafy'), ('sabotsy-namehana', 'Sabotsy Namehana'),
  ('soixante-sept-ha', '67 Ha'), ('faravohitra', 'Faravohitra'), ('mandrosoa', 'Mandrosoa'),
  ('ampandrana', 'Ampandrana'), ('tsaralalana', 'Tsaralalana'), ('anosizato', 'Anosizato'),
  ('ambohimangakely', 'Ambohimangakely')
) as v(slug, nom)
cross join (select id from public.places where slug = 'antananarivo') p
on conflict (slug) do update set name_fr = excluded.name_fr;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. LA HIÉRARCHIE
--
-- On ne remonte que ce qui sert vraiment : une ville appartient à sa région,
-- une zone touristique à sa ville de rattachement. Sans cela, « chercher dans
-- la région Diana » ne peut pas descendre jusqu'à Ramena.
-- ────────────────────────────────────────────────────────────────────────────
update public.places v
set parent_id = r.id
from public.places r
where r.kind = 'region' and r.name_fr = v.region
  and v.kind in ('ville','commune','zone_touristique','parc','ile','plage','site','district')
  and v.parent_id is null;

update public.places r set parent_id = m.id
from (select id from public.places where slug = 'madagascar') m
where r.kind = 'region' and r.parent_id is null;

-- Rattachements que la région seule ne donne pas.
update public.places set parent_id = (select id from public.places where slug = 'nosy-be')
  where slug in ('hell-ville','ambatoloaka','andilana');
update public.places set parent_id = (select id from public.places where slug = 'nosy-boraha')
  where slug in ('ambodifotatra','ile-aux-nattes');
update public.places set parent_id = (select id from public.places where slug = 'ampefy')
  where slug in ('analavory','lac-itasy');
update public.places set parent_id = (select id from public.places where slug = 'isalo')
  where slug = 'ranohira';
update public.places set parent_id = (select id from public.places where slug = 'ifaty')
  where slug = 'mangily';
update public.places set parent_id = (select id from public.places where slug = 'andasibe')
  where slug in ('analamazaotra','mantadia');
update public.places set parent_id = (select id from public.places where slug = 'antsiranana')
  where slug in ('ramena','mer-d-emeraude','trois-baies','baie-de-sakalava');
update public.places set parent_id = (select id from public.places where slug = 'anakao')
  where slug = 'nosy-ve';
update public.places set parent_id = (select id from public.places where slug = 'montagne-d-ambre')
  where slug = 'joffreville';
update public.places set parent_id = (select id from public.places where slug = 'mahajanga')
  where slug in ('cirque-rouge','grotte-d-anjohibe','katsepy');
update public.places set parent_id = (select id from public.places where slug = 'taolagnaro')
  where slug in ('sainte-luce','lokaro','nahampoana','pic-saint-louis','berenty');
update public.places set parent_id = (select id from public.places where slug = 'ambositra')
  where slug in ('zafimaniry','antoetra');
update public.places set parent_id = (select id from public.places where slug = 'morondava')
  where slug in ('allee-des-baobabs','kirindy','belo-sur-mer');
update public.places set parent_id = (select id from public.places where slug = 'tsingy-de-bemaraha')
  where slug = 'bekopaka';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. LES ALIAS
--
-- C'est LA table qui décide si la recherche marche. Trois familles :
--   ① les doubles noms officiels       : Mahajanga / Majunga
--   ② les usages courants              : Tana, Fianar, Diego
--   ③ les graphies fautives fréquentes : Tulear sans accent, Nossi-Bé
-- ────────────────────────────────────────────────────────────────────────────
insert into public.place_aliases (place_id, alias)
select p.id, a.alias
from (values
  ('antananarivo', 'Tana'), ('antananarivo', 'Tananarive'), ('antananarivo', 'Antananarivo'),
  ('antananarivo', 'TNR'), ('antananarivo', 'Antananarivo Renivohitra'),
  ('toamasina', 'Tamatave'), ('toamasina', 'Tamatavé'), ('toamasina', 'Toamasina'),
  ('mahajanga', 'Majunga'), ('mahajanga', 'Mahajanga'), ('mahajanga', 'Majungà'),
  ('mahajanga', 'Mahajanga be'), ('mahajanga', 'Majunga be'),
  ('toliara', 'Tuléar'), ('toliara', 'Tulear'), ('toliara', 'Toliary'), ('toliara', 'Toliara'),
  ('toliara', 'Tuléary'),
  ('antsiranana', 'Diego'), ('antsiranana', 'Diego-Suarez'), ('antsiranana', 'Diégo'),
  ('antsiranana', 'Diégo-Suarez'), ('antsiranana', 'Diego Suarez'), ('antsiranana', 'Antsiranana'),
  ('fianarantsoa', 'Fianar'), ('fianarantsoa', 'Fianarantsoa'),
  ('taolagnaro', 'Fort-Dauphin'), ('taolagnaro', 'Fort Dauphin'), ('taolagnaro', 'Tolagnaro'),
  ('taolagnaro', 'Taolagnaro'), ('taolagnaro', 'Faradofay'),
  ('nosy-boraha', 'Sainte-Marie'), ('nosy-boraha', 'Sainte Marie'), ('nosy-boraha', 'Ile Sainte-Marie'),
  ('nosy-boraha', 'Île Sainte-Marie'), ('nosy-boraha', 'Nosy Boraha'), ('nosy-boraha', 'Ste Marie'),
  ('nosy-be', 'Nosy-Be'), ('nosy-be', 'Nossi-Bé'), ('nosy-be', 'Nossi Be'), ('nosy-be', 'Nosybe'),
  ('nosy-be', 'Nosy Be'), ('nosy-be', 'Ile aux parfums'),
  ('hell-ville', 'Andoany'), ('hell-ville', 'Hellville'), ('hell-ville', 'Hell Ville'),
  ('ile-aux-nattes', 'Nosy Nato'), ('ile-aux-nattes', 'Ile aux Nattes'),
  ('ampefy', 'Lac Itasy'), ('ampefy', 'Analavory'), ('ampefy', 'Ampefy Itasy'),
  ('foulpointe', 'Mahavelona'), ('foulpointe', 'Foulpointe'),
  ('fenoarivo-atsinanana', 'Fénérive'), ('fenoarivo-atsinanana', 'Fenerive Est'),
  ('fenoarivo-atsinanana', 'Fenoarivo Atsinanana'),
  ('vohemar', 'Iharana'), ('vohemar', 'Vohemar'),
  ('isalo', 'Parc de l''Isalo'), ('isalo', 'Ranohira'), ('isalo', 'Massif de l''Isalo'),
  ('andasibe', 'Périnet'), ('andasibe', 'Perinet'), ('andasibe', 'Analamazaotra'),
  ('andasibe', 'Andasibe-Mantadia'),
  ('montagne-d-ambre', 'Ambohitra'), ('montagne-d-ambre', 'Montagne d''Ambre'),
  ('montagne-d-ambre', 'Amber Mountain'),
  ('joffreville', 'Ambohitra village'),
  ('allee-des-baobabs', 'Avenue des Baobabs'), ('allee-des-baobabs', 'Baobabs Morondava'),
  ('allee-des-baobabs', 'Allée des baobabs'),
  ('tsingy-de-bemaraha', 'Tsingy'), ('tsingy-de-bemaraha', 'Bemaraha'),
  ('tsingy-de-bemaraha', 'Tsingy Bemaraha'),
  ('ifaty', 'Ifaty-Mangily'), ('ifaty', 'Mangily'),
  ('mangily', 'Ifaty Mangily'),
  ('zafimaniry', 'Pays zafimaniry'), ('zafimaniry', 'Zafimaniry'),
  ('ambatondrazaka', 'Alaotra'), ('lac-alaotra', 'Alaotra'), ('lac-alaotra', 'Lac Alaotra'),
  ('canal-des-pangalanes', 'Pangalanes'), ('canal-des-pangalanes', 'Les Pangalanes'),
  ('ankarafantsika', 'Ampijoroa'), ('ankarafantsika', 'Ankarafantsika'),
  ('mer-d-emeraude', 'Emerald Sea'), ('mer-d-emeraude', 'Mer d''Emeraude'),
  ('baie-de-sakalava', 'Sakalava Bay'), ('baie-de-sakalava', 'Sakalava'),
  ('cap-sainte-marie', 'Faux Cap'), ('cap-sainte-marie', 'Tanjona Vohimena'),
  ('cap-sainte-marie', 'Cap Ste Marie'),
  ('nosy-mangabe', 'Mangabe'),
  ('port-berge', 'Boriziny'),
  ('miandrivazo', 'Tsiribihina Miandrivazo'),
  ('antsirabe', 'Antsirabe'), ('antsirabe', 'Vichy malgache'),
  ('ambalavao', 'Ambalavao Tsienimparihy'),
  ('ranomafana', 'Parc de Ranomafana'),
  ('masoala', 'Presqu''île du Masoala'), ('masoala', 'Peninsule Masoala'),
  ('marojejy', 'Parc du Marojejy'),
  ('andringitra', 'Parc de l''Andringitra'), ('andringitra', 'Pic Boby'),
  ('tsaranoro', 'Vallée du Tsaranoro'),
  ('soixante-sept-ha', '67ha'), ('soixante-sept-ha', '67 hectares'),
  ('anosy-tana', 'Anosy Antananarivo'), ('anosy-tana', 'Lac Anosy')
) as a(slug, alias)
join public.places p on p.slug = a.slug
on conflict (place_id, alias) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. SAISONNALITÉ DES DESTINATIONS PHARES
--
-- « Quand partir » est la première question du voyageur étranger. On ne
-- renseigne que là où la réponse est nette et vérifiable — les baleines, les
-- cyclones, la fermeture des Tsingy. Ailleurs, silence plutôt qu'à-peu-près.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.place_seasons (place_id, month, rating, reason)
select p.id, s.mois, s.note, s.raison
from (values
  ('nosy-boraha', 1,  'deconseillee', 'Saison des pluies et risque cyclonique'),
  ('nosy-boraha', 2,  'deconseillee', 'Pic de la saison cyclonique'),
  ('nosy-boraha', 3,  'deconseillee', 'Pluies et cyclones encore possibles'),
  ('nosy-boraha', 4,  'correcte',     'Fin des pluies, végétation superbe'),
  ('nosy-boraha', 5,  'correcte',     'Temps sec qui s''installe'),
  ('nosy-boraha', 6,  'correcte',     'Premières baleines'),
  ('nosy-boraha', 7,  'ideale',       'Baleines à bosse, temps sec'),
  ('nosy-boraha', 8,  'ideale',       'Pleine saison des baleines'),
  ('nosy-boraha', 9,  'ideale',       'Baleines et mères avec baleineaux'),
  ('nosy-boraha', 10, 'correcte',     'Fin de la saison des baleines'),
  ('nosy-boraha', 11, 'correcte',     'Chaleur qui monte'),
  ('nosy-boraha', 12, 'deconseillee', 'Début de la saison des pluies'),
  ('tsingy-de-bemaraha', 1,  'deconseillee', 'Parc fermé, piste impraticable'),
  ('tsingy-de-bemaraha', 2,  'deconseillee', 'Parc fermé'),
  ('tsingy-de-bemaraha', 3,  'deconseillee', 'Parc fermé'),
  ('tsingy-de-bemaraha', 4,  'correcte',     'Réouverture progressive selon l''état de la piste'),
  ('tsingy-de-bemaraha', 5,  'ideale',       'Piste sèche, parc ouvert'),
  ('tsingy-de-bemaraha', 6,  'ideale',       'Meilleure période'),
  ('tsingy-de-bemaraha', 7,  'ideale',       'Meilleure période'),
  ('tsingy-de-bemaraha', 8,  'ideale',       'Meilleure période'),
  ('tsingy-de-bemaraha', 9,  'ideale',       'Chaud et sec'),
  ('tsingy-de-bemaraha', 10, 'correcte',     'Très chaud'),
  ('tsingy-de-bemaraha', 11, 'correcte',     'Chaleur forte, premières pluies'),
  ('tsingy-de-bemaraha', 12, 'deconseillee', 'Fermeture pour la saison des pluies'),
  ('nosy-be', 1,  'correcte',     'Chaud et humide, averses courtes'),
  ('nosy-be', 2,  'deconseillee', 'Pic des pluies et risque cyclonique'),
  ('nosy-be', 3,  'deconseillee', 'Pluies encore fortes'),
  ('nosy-be', 4,  'correcte',     'Fin des pluies'),
  ('nosy-be', 5,  'ideale',       'Sec et doux'),
  ('nosy-be', 6,  'ideale',       'Sec, mer calme'),
  ('nosy-be', 7,  'ideale',       'Haute saison'),
  ('nosy-be', 8,  'ideale',       'Haute saison'),
  ('nosy-be', 9,  'ideale',       'Sec, visibilité maximale sous l''eau'),
  ('nosy-be', 10, 'ideale',       'Requins-baleines'),
  ('nosy-be', 11, 'ideale',       'Requins-baleines, avant les pluies'),
  ('nosy-be', 12, 'correcte',     'Chaleur et premières pluies'),
  ('isalo', 1,  'correcte',     'Pluies d''orage, paysages verts'),
  ('isalo', 2,  'correcte',     'Pluies d''orage'),
  ('isalo', 3,  'correcte',     'Fin des pluies'),
  ('isalo', 4,  'ideale',       'Sec et tempéré'),
  ('isalo', 5,  'ideale',       'Randonnée agréable'),
  ('isalo', 6,  'ideale',       'Sec, nuits fraîches'),
  ('isalo', 7,  'ideale',       'Sec, nuits froides'),
  ('isalo', 8,  'ideale',       'Sec'),
  ('isalo', 9,  'ideale',       'Sec, chaleur qui monte'),
  ('isalo', 10, 'correcte',     'Très chaud en journée'),
  ('isalo', 11, 'deconseillee', 'Chaleur écrasante'),
  ('isalo', 12, 'correcte',     'Chaud, premières pluies'),
  ('mahajanga', 1,  'deconseillee', 'Saison des pluies'),
  ('mahajanga', 2,  'deconseillee', 'Pluies et risque cyclonique'),
  ('mahajanga', 3,  'correcte',     'Fin des pluies'),
  ('mahajanga', 4,  'ideale',       'Sec, mer chaude'),
  ('mahajanga', 5,  'ideale',       'Sec et ensoleillé'),
  ('mahajanga', 6,  'ideale',       'Sec, agréable'),
  ('mahajanga', 7,  'ideale',       'Vacances scolaires, haute saison'),
  ('mahajanga', 8,  'ideale',       'Vacances scolaires, haute saison'),
  ('mahajanga', 9,  'ideale',       'Sec et chaud'),
  ('mahajanga', 10, 'ideale',       'Chaud, avant les pluies'),
  ('mahajanga', 11, 'correcte',     'Chaleur forte'),
  ('mahajanga', 12, 'deconseillee', 'Début des pluies')
) as s(slug, mois, note, raison)
join public.places p on p.slug = s.slug
on conflict (place_id, month) do update set rating = excluded.rating, reason = excluded.reason;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RATTACHEMENT DES PUBLICATIONS EXISTANTES
--
-- Elles rangent leur lieu en texte libre (« Nosy be », « Toliara », « Île aux
-- Nattes »). On les relie au référentiel par la forme normalisée, nom ou alias.
-- Sans ce pont, le contenu réel du site reste invisible à la recherche.
--
-- On privilégie l'alias exact, puis le nom le plus court qui contient le terme
-- (« Nosy Be » plutôt que « Nosy Be Ambatoloaka »).
-- ────────────────────────────────────────────────────────────────────────────
update public.posts p
set place_id = c.place_id
from (
  select po.id as post_id, pl.id as place_id
  from public.posts po
  join lateral (
    select pl2.id,
           case
             when exists (select 1 from public.place_aliases al
                          where al.place_id = pl2.id and al.norm = public.dk_norm(po.place)) then 0
             when pl2.norm = public.dk_norm(po.place) then 1
             else 2
           end as rang,
           length(pl2.norm) as taille
    from public.places pl2
    where pl2.norm like '%' || public.dk_norm(po.place) || '%'
       or exists (select 1 from public.place_aliases al
                  where al.place_id = pl2.id and al.norm = public.dk_norm(po.place))
    order by rang, taille
    limit 1
  ) pl on true
  where po.place is not null and po.place <> '' and po.place_id is null
) c
where p.id = c.post_id;

-- Compteurs dénormalisés : ce sont eux qui classeront les destinations.
update public.places pl
set nb_posts = coalesce(c.n, 0)
from (select place_id, count(*) as n from public.posts
      where place_id is not null and status = 'published' group by place_id) c
where pl.id = c.place_id;
