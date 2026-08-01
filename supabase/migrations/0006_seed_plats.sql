-- ============================================================================
-- 0006 — GARNISSAGE DU RÉFÉRENTIEL DES PLATS
--
-- ~100 plats malgaches avec leurs variantes orthographiques. C'est ce qui rend
-- possible « où manger du ravitoto » : personne n'écrit un plat de la même
-- façon — ravitoto, ravi-toto, ravitoto sy henakisoa, feuilles de manioc
-- pilées désignent la même assiette.
--
-- ⚠ DEUX CHOIX ASSUMÉS
--
--  ① ~100 entrées, pas les 150 annoncées dans le TDR. Les 100 sont réelles et
--    vérifiables ; compléter jusqu'à 150 aurait demandé d'inventer des plats
--    ou de dupliquer des variantes. Le fichier est fait pour être complété au
--    fil des cartes que les restaurants saisiront — c'est d'ailleurs eux qui
--    révéleront les manques réels.
--
--  ② price_min_ar / price_max_ar ne sont renseignés que pour les plats dont la
--    fourchette nationale est large et sûre. Ce sont des ordres de grandeur
--    indicatifs, destinés à donner un repère AVANT qu'un restaurant soit
--    référencé. Dès qu'une carte réelle existe, c'est menu_items.price_ar qui
--    fait foi — jamais cette fourchette.
--
-- Les drapeaux has_pork / has_beef / has_seafood / is_vegetarian ne sont pas
-- décoratifs : ils portent les filtres « sans porc » et « végétarien », qui
-- comptent réellement pour une partie du public.
-- ============================================================================

insert into public.dishes
  (slug, name_fr, name_mg, family, description, has_pork, has_beef, has_seafood,
   has_peanut, is_vegetarian, spice_level, price_min_ar, price_max_ar) values

-- ── LAOKA : ce qui accompagne le riz. Le cœur de la cuisine malgache ────────
  ('romazava','Romazava','Romazava','laoka','Bouillon de brèdes et de zébu, relevé au brède mafane qui engourdit légèrement la langue. Le plat national.',false,true,false,false,false,1,6000,25000),
  ('ravitoto','Ravitoto sy henakisoa','Ravitoto sy hena-kisoa','laoka','Feuilles de manioc pilées mijotées avec du porc. Le plat du dimanche.',true,false,false,false,false,0,7000,25000),
  ('ravitoto-voanio','Ravitoto au lait de coco','Ravitoto sy voanio','laoka','Feuilles de manioc pilées au lait de coco, version côtière.',false,false,false,false,true,0,7000,22000),
  ('henakisoa-amalona','Henakisoa sy amalona','Hena-kisoa sy amalona','laoka','Porc et anguille mijotés ensemble, spécialité des Hautes Terres.',true,false,false,false,false,0,null,null),
  ('henomby-ritra','Hen''omby ritra','Hen''omby ritra','laoka','Zébu mijoté longuement jusqu''à ce que la sauce réduise complètement.',false,true,false,false,false,0,7000,25000),
  ('varanga','Varanga','Varanga','laoka','Zébu effiloché puis rissolé, croustillant sur les bords.',false,true,false,false,false,0,null,null),
  ('kitoza','Kitoza','Kitoza','laoka','Lanières de zébu séchées et fumées, servies avec du vary sosoa au petit déjeuner.',false,true,false,false,false,0,5000,18000),
  ('vary-amin-anana','Vary amin''anana','Vary amin''anana','riz','Riz cuit avec des brèdes et un peu de viande, dans son bouillon.',false,false,false,false,false,0,3000,12000),
  ('akoho-sy-voanio','Poulet au coco','Akoho sy voanio','laoka','Poulet mijoté au lait de coco, plat de la côte.',false,false,false,false,false,0,8000,28000),
  ('akoho-gasy','Poulet fermier','Akoho gasy','laoka','Poulet de basse-cour, chair ferme, mijoté longuement.',false,false,false,false,false,0,8000,30000),
  ('akoho-sakamalao','Poulet au gingembre','Akoho sy sakamalao','laoka','Poulet au gingembre frais et à l''ail.',false,false,false,false,false,1,8000,25000),
  ('henakisoa-sakamalao','Porc au gingembre','Henakisoa sy sakamalao','laoka','Porc sauté au gingembre, ail et poivre.',true,false,false,false,false,1,7000,22000),
  ('tsaramaso','Haricots blancs','Tsaramaso','laoka','Haricots blancs mijotés, souvent avec du porc ou de la viande de zébu.',false,false,false,false,true,0,2500,9000),
  ('tsaramaso-henakisoa','Haricots au porc','Tsaramaso sy henakisoa','laoka','Haricots blancs mijotés avec du porc.',true,false,false,false,false,0,4000,14000),
  ('voanjobory','Voanjobory','Voanjobory','laoka','Pois de terre mijotés, souvent avec du porc.',false,false,false,false,true,0,3000,12000),
  ('voanjobory-henakisoa','Voanjobory sy henakisoa','Voanjobory sy hena-kisoa','laoka','Pois de terre au porc.',true,false,false,false,false,0,5000,16000),
  ('kabaro','Pois du Cap','Kabaro','laoka','Gros haricots plats mijotés, spécialité du Sud-Ouest.',false,false,false,false,true,0,null,null),
  ('anana','Brèdes','Anana','laoka','Feuilles vertes sautées ou en bouillon. Le légume quotidien.',false,false,false,false,true,0,1500,7000),
  ('anamalaho','Brède mafane','Anamalaho','laoka','La brède qui engourdit la bouche, indispensable au romazava.',false,false,false,false,true,0,null,null),
  ('ravimbomanga','Feuilles de patate douce','Ravimbomanga','laoka','Feuilles de patate douce sautées à l''ail.',false,false,false,false,true,0,null,null),
  ('petsay','Chou chinois','Petsay','laoka','Chou chinois sauté, très courant sur les cartes.',false,false,false,false,true,0,null,null),
  ('trondro-gasy','Poisson d''eau douce','Trondro gasy','laoka','Poisson de rivière ou de rizière, frit ou en sauce.',false,false,false,false,false,0,null,null),
  ('amalona','Anguille','Amalona','laoka','Anguille en sauce, souvent au lait de coco ou avec du porc.',false,false,false,false,false,0,null,null),
  ('trondro-voanio','Poisson au lait de coco','Trondro sy voanio','laoka','Poisson mijoté au lait de coco et à la tomate.',false,false,true,false,false,0,10000,35000),
  ('vorontsiloza','Dinde','Vorontsiloza','laoka','Dinde mijotée, plat de fête.',false,false,false,false,false,0,null,null),

-- ── RIZ ET FÉCULENTS ────────────────────────────────────────────────────────
  ('vary-maina','Riz blanc','Vary maina','riz','Le riz nature, base de tous les repas.',false,false,false,false,true,0,1000,4000),
  ('vary-sosoa','Riz mou','Vary sosoa','riz','Riz très cuit dans beaucoup d''eau, mangé au petit déjeuner avec du kitoza.',false,false,false,false,true,0,1500,6000),
  ('vary-be-menaka','Vary be menaka','Vary be menaka','riz','Riz gras cuisiné avec de la viande et du bouillon.',false,true,false,false,false,0,null,null),
  ('ampango','Ampango','Ampango','riz','La croûte de riz grillée au fond de la marmite.',false,false,false,false,true,0,null,null),
  ('riz-cantonais','Riz cantonais','Vary sinoa','riz','Riz sauté aux œufs, légumes et charcuterie.',true,false,false,false,false,0,6000,20000),
  ('riz-frit','Riz sauté','Vary tono','riz','Riz sauté aux légumes.',false,false,false,false,false,0,5000,16000),
  ('mine-sao','Mi sao','Mi sao','riz','Nouilles sautées aux légumes et à la viande. Le plat de rue le plus répandu.',false,false,false,false,false,0,3000,15000),
  ('briani','Briani','Briani','riz','Riz épicé au safran cuit avec la viande, héritage indo-pakistanais.',false,false,false,false,false,1,7000,25000),

-- ── SOUPES ──────────────────────────────────────────────────────────────────
  ('soupe-chinoise','Soupe chinoise','Lasopy sinoa','soupe','Bouillon aux nouilles, légumes et viande. Le repas rapide par excellence.',false,false,false,false,false,0,3000,15000),
  ('lasopy','Soupe de légumes','Lasopy','soupe','Bouillon de légumes passé, servi en entrée.',false,false,false,false,true,0,2000,10000),
  ('ro-mazava-bouillon','Bouillon de zébu','Ron''omby','soupe','Bouillon clair de zébu, avec os à moelle.',false,true,false,false,false,0,null,null),

-- ── GRILLADES ───────────────────────────────────────────────────────────────
  ('masikita','Masikita','Masikita','grillade','Petites brochettes de zébu grillées au charbon, vendues au bord de la route.',false,true,false,false,false,1,500,3000),
  ('zebu-grille','Zébu grillé','Hen''omby atono','grillade','Pavé ou côte de zébu grillé au feu de bois.',false,true,false,false,false,0,12000,45000),
  ('filet-de-zebu','Filet de zébu','Filet''omby','grillade','La pièce noble du zébu, grillée saignante.',false,true,false,false,false,0,18000,55000),
  ('brochette','Brochette','Brochette','grillade','Brochette de viande ou de poisson grillée.',false,false,false,false,false,0,2000,12000),
  ('poulet-grille','Poulet grillé','Akoho atono','grillade','Demi-poulet grillé au charbon.',false,false,false,false,false,0,8000,25000),
  ('saucisse-antsirabe','Saucisse d''Antsirabe','Saosisy Antsirabe','grillade','La saucisse fumée d''Antsirabe, grillée ou poêlée.',true,false,false,false,false,0,null,null),
  ('cote-de-porc','Côte de porc grillée','Taolan-kisoa atono','grillade','Côte de porc grillée au charbon.',true,false,false,false,false,0,8000,25000),

-- ── FRUITS DE MER ───────────────────────────────────────────────────────────
  ('langouste','Langouste','Orana be','fruit-de-mer','Langouste grillée ou à l''ail. Le plat de fête des côtes.',false,false,true,false,false,0,35000,120000),
  ('crabe','Crabe','Foza','fruit-de-mer','Crabe de mangrove, grillé ou en sauce coco.',false,false,true,false,false,0,15000,50000),
  ('crevettes','Crevettes','Makamba','fruit-de-mer','Crevettes sautées à l''ail ou en sauce coco.',false,false,true,false,false,0,15000,50000),
  ('camaron','Camaron','Orana','fruit-de-mer','Écrevisse géante d''eau douce, grillée. Spécialité du Sud-Est.',false,false,true,false,false,0,25000,80000),
  ('poulpe','Poulpe','Orita','fruit-de-mer','Poulpe grillé ou en salade, spécialité vezo.',false,false,true,false,false,0,12000,40000),
  ('calamar','Calamars','Kalamary','fruit-de-mer','Calamars frits ou à la sauce coco.',false,false,true,false,false,0,12000,40000),
  ('poisson-grille','Poisson grillé','Trondro atono','fruit-de-mer','Poisson entier grillé au feu de bois, servi avec du riz.',false,false,true,false,false,0,10000,40000),
  ('capitaine','Capitaine','Kapiteny','fruit-de-mer','Filet de capitaine grillé ou meunière.',false,false,true,false,false,0,15000,45000),
  ('thon','Thon','Lamatra','fruit-de-mer','Steak de thon grillé ou en carpaccio.',false,false,true,false,false,0,12000,40000),
  ('espadon','Espadon','Espadon','fruit-de-mer','Steak d''espadon grillé.',false,false,true,false,false,0,15000,45000),
  ('huitres','Huîtres','Huîtres','fruit-de-mer','Huîtres de la côte ouest, servies crues.',false,false,true,false,false,0,null,null),
  ('moules','Moules','Moules','fruit-de-mer','Moules marinière ou à la crème.',false,false,true,false,false,0,null,null),
  ('bichique','Bichiques','Bichique','fruit-de-mer','Alevins pêchés à l''embouchure des rivières de la côte est, en beignets ou en sauce.',false,false,true,false,false,0,null,null),
  ('tilapia','Tilapia','Tilapia','fruit-de-mer','Tilapia frit, poisson d''élevage courant.',false,false,false,false,false,0,6000,20000),
  ('carpe','Carpe','Karpa','fruit-de-mer','Carpe de rizière, frite ou en sauce. Plat des Hautes Terres.',false,false,false,false,false,0,null,null),
  ('crevettes-coco','Crevettes au coco','Makamba sy voanio','fruit-de-mer','Crevettes mijotées au lait de coco.',false,false,true,false,false,0,18000,50000),

-- ── STREET-FOOD ET BEIGNETS ─────────────────────────────────────────────────
  ('sambos','Samoussa','Sambos','street-food','Triangle de pâte fine farci à la viande ou aux légumes, frit. Vendu partout.',false,false,false,false,false,1,200,1500),
  ('nem','Nem','Nem','street-food','Rouleau frit farci de vermicelles et de légumes, servi avec sa sauce.',true,false,false,false,false,0,300,2000),
  ('mofo-gasy','Mofo gasy','Mofo gasy','mofo','Beignet de riz rond et moelleux, le petit déjeuner de la rue.',false,false,false,false,true,0,200,1000),
  ('mofo-baolina','Mofo baolina','Mofo baolina','mofo','Boule de pâte frite, sucrée.',false,false,false,false,true,0,200,1000),
  ('mofo-anana','Mofo anana','Mofo anana','mofo','Beignet aux brèdes.',false,false,false,false,true,0,200,1000),
  ('mofo-akondro','Mofo akondro','Mofo akondro','mofo','Beignet de banane écrasée.',false,false,false,false,true,0,200,1200),
  ('mofo-sakay','Mofo sakay','Mofo sakay','mofo','Beignet pimenté, souvent aux légumes.',false,false,false,false,true,2,200,1000),
  ('ramanonaka','Ramanonaka','Ramanonaka','mofo','Galette de riz frite dans l''huile, plate et dorée.',false,false,false,false,true,0,null,null),
  ('menakely','Menakely','Menakely','mofo','Beignet à la levure, moelleux et sucré.',false,false,false,false,true,0,200,1000),
  ('koba-ravina','Koba ravina','Koba ravina','dessert','Pâte de riz, cacahuètes et banane cuite longuement dans une feuille de bananier.',false,false,false,true,true,0,500,3000),
  ('godro-godro','Godro-godro','Godro-godro','dessert','Gâteau de manioc râpé au lait de coco et à la cannelle.',false,false,false,false,true,0,500,3000),
  ('bonbon-coco','Bonbon coco','Bonbon coco','dessert','Confiserie de noix de coco caramélisée.',false,false,false,false,true,0,200,1500),
  ('gateau-patate','Gâteau patate','Mokary vomanga','dessert','Gâteau de patate douce, dense et sucré.',false,false,false,false,true,0,300,2000),
  ('koba','Koba','Koba','dessert','La pâte sucrée aux cacahuètes, vendue en tranches.',false,false,false,true,true,0,500,3000),
  ('banane-flambee','Banane flambée','Akondro flambé','dessert','Banane flambée au rhum, le dessert de restaurant le plus répandu.',false,false,false,false,true,0,4000,15000),
  ('salade-de-fruits','Salade de fruits','Voankazo','dessert','Fruits de saison en salade : mangue, ananas, litchi, papaye.',false,false,false,false,true,0,3000,12000),

-- ── CONDIMENTS ET ACCOMPAGNEMENTS ───────────────────────────────────────────
  ('lasary-voatabia','Lasary de tomates','Lasary voatabia','laoka','Tomates, oignons et cives crues, relevées au citron. Sur toutes les tables.',false,false,false,false,true,1,500,4000),
  ('achard','Achards','Lasary karaoty','laoka','Carottes, chou et haricots verts marinés au vinaigre et à la moutarde.',false,false,false,false,true,1,500,4000),
  ('sakay','Sakay','Sakay','laoka','La purée de piment malgache, servie à part. À doser.',false,false,false,false,true,3,200,2000),
  ('lasary-manga','Lasary de mangue verte','Lasary manga','laoka','Mangue verte râpée, relevée au piment et au sel.',false,false,false,false,true,2,null,null),

-- ── SPÉCIALITÉS RÉGIONALES ──────────────────────────────────────────────────
  ('foie-gras-behenjy','Foie gras de Behenjy','Foie gras Behenjy','laoka','Le foie gras produit à Behenjy, sur la RN7 au sud de Tana.',false,false,false,false,false,0,null,null),
  ('voatsiperifery','Poivre voatsiperifery','Voatsiperifery','laoka','Le poivre sauvage de liane, cueilli en forêt. Aromatique et rare.',false,false,false,false,true,1,null,null),
  ('henan-omby-vary-sosoa','Kitoza et vary sosoa','Kitoza sy vary sosoa','riz','Le petit déjeuner traditionnel des Hautes Terres.',false,true,false,false,false,0,3000,12000),

-- ── BOISSONS ────────────────────────────────────────────────────────────────
  ('thb','THB','THB','boisson','Three Horses Beer, la bière nationale.',false,false,false,false,true,0,3000,12000),
  ('rhum-arrange','Rhum arrangé','Toaka gasy arrangé','boisson','Rhum macéré aux fruits et aux épices : vanille, litchi, gingembre, combava.',false,false,false,false,true,0,3000,15000),
  ('punch-coco','Punch coco','Punch coco','boisson','Rhum, lait de coco et lait concentré.',false,false,false,false,true,0,4000,15000),
  ('toaka-gasy','Toaka gasy','Toaka gasy','boisson','Le rhum artisanal de canne, distillé au village.',false,false,false,false,true,0,null,null),
  ('betsabetsa','Betsabetsa','Betsabetsa','boisson','Vin de canne à sucre fermenté, boisson de la côte est.',false,false,false,false,true,0,null,null),
  ('ranovola','Ranovola','Ranon''ampango','boisson','L''eau bouillie sur la croûte de riz grillée. La boisson du repas.',false,false,false,false,true,0,0,2000),
  ('jus-corossol','Jus de corossol','Ranom-boankazo','boisson','Jus de corossol frais, épais et parfumé.',false,false,false,false,true,0,2000,10000),
  ('jus-tamarin','Jus de tamarin','Ranon''kily','boisson','Jus de tamarin, acidulé.',false,false,false,false,true,0,2000,10000),
  ('jus-fruit-passion','Jus de fruit de la passion','Ranom-barinia','boisson','Jus de grenadelle frais.',false,false,false,false,true,0,2000,10000),
  ('bonbon-anglais','Bonbon anglais','Bonbon anglais','boisson','La limonade locale, très sucrée.',false,false,false,false,true,0,1000,5000),
  ('vin-betsileo','Vin de Betsileo','Divay Betsileo','boisson','Le vin produit autour de Fianarantsoa.',false,false,false,false,true,0,8000,35000),
  ('cafe-malgache','Café','Kafe','boisson','Le café malgache, robusta de la côte est ou arabica d''altitude.',false,false,false,false,true,0,1000,8000),
  ('eau-de-coco','Eau de coco','Ranom-boanio','boisson','L''eau de la noix de coco fraîche, bue à la paille.',false,false,false,false,true,0,1000,5000)

on conflict (slug) do update set
  name_fr = excluded.name_fr, name_mg = excluded.name_mg, family = excluded.family,
  description = excluded.description, has_pork = excluded.has_pork,
  has_beef = excluded.has_beef, has_seafood = excluded.has_seafood,
  is_vegetarian = excluded.is_vegetarian, spice_level = excluded.spice_level,
  price_min_ar = excluded.price_min_ar, price_max_ar = excluded.price_max_ar;

-- ────────────────────────────────────────────────────────────────────────────
-- LES ALIAS DES PLATS
--
-- Sans eux, le référentiel ne sert à rien : c'est ici que « feuilles de manioc
-- pilées », « ravi-toto » et « ravitoto sy hena-kisoa » se rejoignent.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.dish_aliases (dish_id, alias)
select d.id, a.alias
from (values
  ('romazava','romazava'),('romazava','romazava gasy'),('romazava','bouillon de bredes'),
  ('romazava','romazave'),('romazava','romazava sy hena omby'),
  ('ravitoto','ravitoto'),('ravitoto','ravi-toto'),('ravitoto','ravitoto sy henakisoa'),
  ('ravitoto','ravitoto sy hena-kisoa'),('ravitoto','ravitoto au porc'),
  ('ravitoto','feuilles de manioc pilees'),('ravitoto','ravitoto porc'),('ravitoto','ravitotoo'),
  ('ravitoto-voanio','ravitoto sy voanio'),('ravitoto-voanio','ravitoto coco'),
  ('ravitoto-voanio','ravitoto au coco'),
  ('henakisoa-amalona','henakisoa sy amalona'),('henakisoa-amalona','hena kisoa sy amalona'),
  ('henakisoa-amalona','porc anguille'),
  ('henomby-ritra','henomby ritra'),('henomby-ritra','hena ritra'),('henomby-ritra','hen omby ritra'),
  ('henomby-ritra','zebu mijote'),('henomby-ritra','ritra'),
  ('varanga','varanga'),('varanga','zebu effiloche'),
  ('kitoza','kitoza'),('kitoza','kitoza sy vary sosoa'),('kitoza','viande sechee'),
  ('vary-amin-anana','vary amin anana'),('vary-amin-anana','vary aminanana'),
  ('vary-amin-anana','riz aux bredes'),('vary-amin-anana','vary anana'),
  ('akoho-sy-voanio','akoho sy voanio'),('akoho-sy-voanio','poulet coco'),
  ('akoho-sy-voanio','poulet au lait de coco'),('akoho-sy-voanio','akoho voanio'),
  ('akoho-gasy','akoho gasy'),('akoho-gasy','poulet gasy'),('akoho-gasy','poulet fermier'),
  ('akoho-sakamalao','akoho sy sakamalao'),('akoho-sakamalao','poulet gingembre'),
  ('akoho-sakamalao','sakamalao'),
  ('henakisoa-sakamalao','henakisoa sy sakamalao'),('henakisoa-sakamalao','porc gingembre'),
  ('tsaramaso','tsaramaso'),('tsaramaso','haricot blanc'),('tsaramaso','tsaramasoo'),
  ('tsaramaso-henakisoa','tsaramaso sy henakisoa'),('tsaramaso-henakisoa','haricot porc'),
  ('voanjobory','voanjobory'),('voanjobory','pois de terre'),
  ('voanjobory-henakisoa','voanjobory sy henakisoa'),('voanjobory-henakisoa','voanjobory sy hena-kisoa'),
  ('kabaro','kabaro'),('kabaro','pois du cap'),
  ('anana','anana'),('anana','bredes'),('anana','anandrano'),('anana','anantsonga'),
  ('anana','brede'),('anana','anamamy'),
  ('anamalaho','anamalaho'),('anamalaho','brede mafane'),('anamalaho','mafane'),
  ('ravimbomanga','ravimbomanga'),('ravimbomanga','feuilles de patate douce'),
  ('petsay','petsay'),('petsay','chou chinois'),
  ('trondro-gasy','trondro gasy'),('trondro-gasy','poisson d eau douce'),
  ('amalona','amalona'),('amalona','anguille'),
  ('trondro-voanio','trondro sy voanio'),('trondro-voanio','poisson coco'),
  ('trondro-voanio','poisson au lait de coco'),
  ('vorontsiloza','vorontsiloza'),('vorontsiloza','dinde'),
  ('vary-maina','vary maina'),('vary-maina','riz blanc'),('vary-maina','vary'),
  ('vary-sosoa','vary sosoa'),('vary-sosoa','sosoa'),('vary-sosoa','riz mou'),
  ('vary-be-menaka','vary be menaka'),('vary-be-menaka','riz gras'),
  ('ampango','ampango'),('ampango','riz grille'),
  ('riz-cantonais','riz cantonais'),('riz-cantonais','vary sinoa'),('riz-cantonais','riz cantonnais'),
  ('riz-frit','riz saute'),('riz-frit','riz frit'),
  ('mine-sao','mi sao'),('mine-sao','misao'),('mine-sao','mine sao'),('mine-sao','minesao'),
  ('mine-sao','nouilles sautees'),('mine-sao','mi-sao'),
  ('briani','briani'),('briani','biriani'),('briani','biryani'),('briani','biriyani'),
  ('soupe-chinoise','soupe chinoise'),('soupe-chinoise','soupe sinoa'),('soupe-chinoise','soupe'),
  ('lasopy','lasopy'),('lasopy','soupe de legumes'),
  ('ro-mazava-bouillon','ronomby'),('ro-mazava-bouillon','bouillon de zebu'),
  ('masikita','masikita'),('masikita','mosakiky'),('masikita','brochette zebu'),
  ('masikita','masikita zebu'),('masikita','massikita'),
  ('zebu-grille','zebu grille'),('zebu-grille','hen omby atono'),('zebu-grille','steak de zebu'),
  ('zebu-grille','cote de zebu'),
  ('filet-de-zebu','filet de zebu'),('filet-de-zebu','filet zebu'),
  ('brochette','brochette'),('brochette','brochettes'),
  ('poulet-grille','poulet grille'),('poulet-grille','akoho atono'),
  ('saucisse-antsirabe','saucisse d antsirabe'),('saucisse-antsirabe','saucisse antsirabe'),
  ('saucisse-antsirabe','saosisy'),
  ('cote-de-porc','cote de porc'),('cote-de-porc','taolan-kisoa'),
  ('langouste','langouste'),('langouste','langoustes'),('langouste','orana be'),
  ('langouste','langouste grillee'),
  ('crabe','crabe'),('crabe','foza'),('crabe','crabes'),('crabe','crabe de mangrove'),
  ('crevettes','crevettes'),('crevettes','makamba'),('crevettes','gambas'),('crevettes','crevette'),
  ('camaron','camaron'),('camaron','camarons'),('camaron','orana'),('camaron','ecrevisse'),
  ('poulpe','poulpe'),('poulpe','orita'),('poulpe','pieuvre'),
  ('calamar','calamar'),('calamar','calamars'),('calamar','kalamary'),('calamar','encornet'),
  ('poisson-grille','poisson grille'),('poisson-grille','trondro atono'),('poisson-grille','poisson braise'),
  ('capitaine','capitaine'),('capitaine','kapiteny'),
  ('thon','thon'),('thon','lamatra'),
  ('espadon','espadon'),
  ('huitres','huitres'),('huitres','huitre'),
  ('moules','moules'),
  ('bichique','bichique'),('bichique','bichiques'),
  ('tilapia','tilapia'),
  ('carpe','carpe'),('carpe','karpa'),
  ('crevettes-coco','crevettes au coco'),('crevettes-coco','makamba sy voanio'),
  ('sambos','sambos'),('sambos','samoussa'),('sambos','samboussa'),('sambos','samosa'),
  ('sambos','sambosa'),('sambos','samoussas'),
  ('nem','nem'),('nem','nems'),
  ('mofo-gasy','mofo gasy'),('mofo-gasy','mofogasy'),('mofo-gasy','beignet malgache'),
  ('mofo-baolina','mofo baolina'),('mofo-baolina','mofobaolina'),
  ('mofo-anana','mofo anana'),('mofo-akondro','mofo akondro'),('mofo-akondro','beignet de banane'),
  ('mofo-sakay','mofo sakay'),
  ('ramanonaka','ramanonaka'),
  ('menakely','menakely'),
  ('koba-ravina','koba ravina'),('koba-ravina','koba akondro'),('koba-ravina','kobandravina'),
  ('godro-godro','godro godro'),('godro-godro','godrogodro'),('godro-godro','gateau de manioc'),
  ('bonbon-coco','bonbon coco'),('bonbon-coco','bonbon de coco'),
  ('gateau-patate','gateau patate'),('gateau-patate','mokary vomanga'),
  ('koba','koba'),('koba','koba cacahuete'),
  ('banane-flambee','banane flambee'),('banane-flambee','akondro flambe'),
  ('salade-de-fruits','salade de fruits'),
  ('lasary-voatabia','lasary'),('lasary-voatabia','lasary voatabia'),('lasary-voatabia','lasary tomate'),
  ('lasary-voatabia','salade de tomates'),
  ('achard','achard'),('achard','achards'),('achard','lasary karaoty'),('achard','lasary carotte'),
  ('sakay','sakay'),('sakay','piment'),('sakay','piment malgache'),
  ('lasary-manga','lasary manga'),('lasary-manga','mangue verte'),
  ('foie-gras-behenjy','foie gras'),('foie-gras-behenjy','foie gras behenjy'),
  ('voatsiperifery','voatsiperifery'),('voatsiperifery','poivre sauvage'),
  ('henan-omby-vary-sosoa','kitoza sy vary sosoa'),
  ('thb','thb'),('thb','three horses beer'),('thb','biere thb'),('thb','biere'),
  ('rhum-arrange','rhum arrange'),('rhum-arrange','rhums arranges'),('rhum-arrange','toaka arrange'),
  ('punch-coco','punch coco'),
  ('toaka-gasy','toaka gasy'),('toaka-gasy','toakagasy'),
  ('betsabetsa','betsabetsa'),
  ('ranovola','ranovola'),('ranovola','ranon ampango'),('ranovola','rano ampango'),
  ('ranovola','ranonapango'),
  ('jus-corossol','corossol'),('jus-corossol','jus de corossol'),
  ('jus-tamarin','tamarin'),('jus-tamarin','jus de tamarin'),('jus-tamarin','kily'),
  ('jus-fruit-passion','fruit de la passion'),('jus-fruit-passion','grenadelle'),
  ('bonbon-anglais','bonbon anglais'),('bonbon-anglais','limonade'),
  ('vin-betsileo','vin betsileo'),('vin-betsileo','vin malgache'),('vin-betsileo','divay'),
  ('cafe-malgache','cafe'),('cafe-malgache','kafe'),
  ('eau-de-coco','eau de coco'),('eau-de-coco','ranom-boanio')
) as a(slug, alias)
join public.dishes d on d.slug = a.slug
on conflict (dish_id, alias) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- LES ÉQUIPEMENTS
--
-- Une case cochée est filtrable ; un mot dans une description ne l'est pas.
-- applies_to dit sur quel type d'établissement l'équipement a un sens : le
-- formulaire de saisie ne proposera pas « piscine » à une agence de voyage.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.amenities (code, label_fr, label_mg, category, applies_to, rang) values
  ('wifi','Wi-Fi','Wifi','confort',array['hotel','restaurant','agence'],10),
  ('climatisation','Climatisation','Climatiseur','confort',array['hotel','restaurant'],20),
  ('ventilateur','Ventilateur','Fanamainam-drivotra','confort',array['hotel'],25),
  ('eau-chaude','Eau chaude','Rano mafana','confort',array['hotel'],30),
  ('moustiquaire','Moustiquaire','Lay','confort',array['hotel'],35),
  ('piscine','Piscine','Dobo filomanosana','confort',array['hotel'],40),
  ('vue-mer','Vue sur la mer','Mahita ranomasina','confort',array['hotel','restaurant'],45),
  ('jardin','Jardin','Zaridaina','confort',array['hotel','restaurant'],50),
  ('terrasse','Terrasse','Lavarangana','confort',array['hotel','restaurant'],55),
  ('groupe-electrogene','Groupe électrogène','Groupe','confort',array['hotel','restaurant'],60),
  ('petit-dejeuner','Petit déjeuner inclus','Sakafo maraina','restauration',array['hotel'],100),
  ('restaurant-sur-place','Restaurant sur place','Toeram-pisakafoanana','restauration',array['hotel'],105),
  ('bar','Bar','Bara','restauration',array['hotel','restaurant'],110),
  ('cuisine-equipee','Cuisine équipée','Lakozia','restauration',array['hotel'],115),
  ('menu-vegetarien','Menu végétarien','Sakafo tsy misy hena','restauration',array['restaurant','hotel'],120),
  ('sans-porc','Options sans porc','Tsy misy kisoa','restauration',array['restaurant','hotel'],125),
  ('livraison','Livraison','Fanaterana','restauration',array['restaurant'],130),
  ('a-emporter','À emporter','Entina','restauration',array['restaurant'],135),
  ('plongee','Plongée','Sitrika','activite',array['hotel','agence'],200),
  ('masque-tuba','Masque et tuba','Snorkeling','activite',array['hotel','agence'],205),
  ('kayak','Kayak','Kayak','activite',array['hotel','agence'],210),
  ('excursion-bateau','Excursion en bateau','Fitsangatsanganana an-tsambo','activite',array['hotel','agence'],215),
  ('randonnee','Randonnée','Fitsangatsanganana an-tongotra','activite',array['hotel','agence'],220),
  ('guide','Guide francophone','Mpitari-dalana','activite',array['hotel','agence'],225),
  ('observation-baleines','Observation des baleines','Fijerena trozona','activite',array['hotel','agence'],230),
  ('peche','Pêche','Fanjonoana','activite',array['hotel','agence'],235),
  ('parking','Parking','Fiantsonana','acces',array['hotel','restaurant'],300),
  ('navette-aeroport','Navette aéroport','Fitaterana','acces',array['hotel'],305),
  ('acces-4x4','Accès 4x4 nécessaire','Mila 4x4','acces',array['hotel'],310),
  ('acces-bateau','Accessible en bateau','Amin''ny sambo','acces',array['hotel'],315),
  ('mobile-money','Mobile Money','Mobile Money','services',array['hotel','restaurant','agence'],400),
  ('carte-bancaire','Carte bancaire','Karatra','services',array['hotel','restaurant','agence'],405),
  ('especes','Espèces','Vola madinika','services',array['hotel','restaurant','agence'],410),
  ('blanchisserie','Blanchisserie','Fanasan-damba','services',array['hotel'],415),
  ('coffre-fort','Coffre-fort','Kesika','services',array['hotel'],420),
  ('reception-24h','Réception 24h/24','Misokatra 24/24','services',array['hotel'],425),
  ('famille','Adapté aux familles','Mety ho an''ny fianakaviana','famille',array['hotel','restaurant'],500),
  ('lit-enfant','Lit enfant','Fandrian-jaza','famille',array['hotel'],505),
  ('chaise-haute','Chaise haute','Seza avo','famille',array['restaurant'],510),
  ('animaux','Animaux acceptés','Biby ekena','famille',array['hotel'],515),
  ('salle-reunion','Salle de réunion','Efitra fivoriana','pro',array['hotel'],600),
  ('facture','Facture sur demande','Faktiora','pro',array['hotel','restaurant','agence'],605)
on conflict (code) do update set
  label_fr = excluded.label_fr, label_mg = excluded.label_mg,
  category = excluded.category, applies_to = excluded.applies_to, rang = excluded.rang;
