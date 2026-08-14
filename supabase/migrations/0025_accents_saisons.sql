-- ============================================================================
-- 0025 — REMETTRE LES ACCENTS SUR LES LIBELLÉS DE SAISON
--
-- ⚠ Ces textes ont été semés à travers un outil qui a mangé les accents :
--   « Meilleure periode », « Sec, nuits fraiches », « Randonnee agreable ».
--   Tant qu'ils n'étaient affichés nulle part, ça ne se voyait pas. Le rail de
--   droite les montre maintenant à chaque visiteur — et un site de voyage
--   malgache qui écrit le français sans accents perd sa crédibilité en une
--   ligne.
--
-- Correction par la DONNÉE, pas par le code : réécrire à l'affichage aurait
-- laissé la base fausse pour l'agent et pour l'export.
-- ============================================================================

update public.place_seasons set reason = t.bon
from (values
  ('Baleines a bosse, temps sec',       'Baleines à bosse, temps sec'),
  ('Baleines et meres avec baleineaux', 'Baleines et mères avec baleineaux'),
  ('Chaleur ecrasante',                 'Chaleur écrasante'),
  ('Chaleur et premieres pluies',       'Chaleur et premières pluies'),
  ('Chaleur forte, premieres pluies',   'Chaleur forte, premières pluies'),
  ('Chaud, premieres pluies',           'Chaud, premières pluies'),
  ('Debut de la saison des pluies',     'Début de la saison des pluies'),
  ('Debut des pluies',                  'Début des pluies'),
  ('Fin des pluies, vegetation superbe','Fin des pluies, végétation superbe'),
  ('Meilleure periode',                 'Meilleure période'),
  ('Parc ferme',                        'Parc fermé'),
  ('Parc ferme, piste impraticable',    'Parc fermé, piste impraticable'),
  ('Piste seche, parc ouvert',          'Piste sèche, parc ouvert'),
  ('Premieres baleines',                'Premières baleines'),
  ('Randonnee agreable',                'Randonnée agréable'),
  ('Reouverture progressive selon l''etat de la piste',
                                        'Réouverture progressive selon l''état de la piste'),
  ('Sec et ensoleille',                 'Sec et ensoleillé'),
  ('Sec et tempere',                    'Sec et tempéré'),
  ('Sec, agreable',                     'Sec, agréable'),
  ('Sec, nuits fraiches',               'Sec, nuits fraîches'),
  ('Sec, visibilite maximale sous l''eau','Sec, visibilité maximale sous l''eau'),
  ('Tres chaud',                        'Très chaud'),
  ('Tres chaud en journee',             'Très chaud en journée')
) as t(mauvais, bon)
where public.place_seasons.reason = t.mauvais;
