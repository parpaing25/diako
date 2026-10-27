-- ============================================================================
-- 0126 — EXPLORER PAR ENVIE : des portes qui disent la vérité sur ce qu'elles
--        ouvrent, et un compteur par envie pris à la source.
--
-- Demande du propriétaire (27/10/2026) : « il faut bien catégoriser pour que ce
-- ne soit pas le bordel ». Le site porte aujourd'hui sept portes vers la
-- découverte — /explorer, /villes, /sites, /plats, /carte, /recherche,
-- /projet — et aucune ne dit ce qu'il y a derrière.
--
-- 🔴 CE QUE LE MOT « CULTURE » CACHAIT. Mesuré ce 27/10/2026 :
--    `dk_kinds_envie('culture')` rend 957 fiches — 296 patrimoines, 26 musées,
--    23 œuvres, et 612 du genre `site`. Or sur ces 612, 477 n'ont AUCUN résumé
--    et l'échantillon est sans appel : Ikopa, Tsiribihina, Fiherenana, Loky,
--    Mananara, rivière de Nosivolo… ce sont les fleuves de Madagascar importés
--    du référentiel géographique. Annoncer 957 derrière le mot culture et
--    ouvrir sur une liste de rivières muettes, c'est le clic qui fait douter du
--    reste du site. Les chiffres honnêtes sont : patrimoine 345, parcs et
--    réserves 276, cascades et grottes 60, plages 318, sommets 824.
--
-- ⚠ RIEN N'EST RETIRÉ, RIEN NE CHANGE DE SENS. Les quatre envies du projet de
--   voyage (plage, nature, trek, culture) gardent EXACTEMENT leurs genres :
--   /projet enregistre ces codes en base (assertion de 0089) et des projets
--   existants les portent. On AJOUTE trois codes que seul l'Explorer emploie.
--
-- ⚠ LE COMPTEUR SE DÉRIVE DE `dk_kinds_envie`, il ne le recopie pas. Une
--   seconde liste de genres écrite à côté diverge au premier genre ajouté, et
--   la tuile annoncerait un nombre que la liste ne sert pas.
-- ============================================================================

create or replace function public.dk_kinds_envie(p_envie text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_envie
    -- ── Les quatre envies de /projet, inchangées depuis 0089 ──────────────
    when 'plage'   then array['plage']
    when 'nature'  then array['parc','reserve','parc_animalier','cascade','grotte','source','aire']
    when 'trek'    then array['sommet','point_de_vue']
    when 'culture' then array['patrimoine','musee','oeuvre','site']
    -- ── Les trois portes de l'Explorer, plus étroites et plus franches ────
    when 'parcs'      then array['parc','reserve','parc_animalier','aire']
    when 'eaux'       then array['cascade','grotte','source']
    when 'patrimoine' then array['patrimoine','musee','oeuvre']
    else null::text[]
  end
$$;

-- ── CE QUE CHAQUE PORTE OUVRE, EN UNE SEULE RÉPONSE ───────────────────────
--
-- ⚠ UNE TUILE SANS CHIFFRE VAUT MIEUX QU'UN CHIFFRE FAUX, mais six appels à
--   `suggestions_envie` juste pour afficher six nombres coûteraient six
--   allers-retours sur une 3G. Une réponse, ~200 octets, mise en cache par le
--   client comme `stats_diako`.
--
-- ⚠ `points_carte` COMPTE CE QUE LA CARTE DESSINE : les adresses et les sites
--   qui ont des coordonnées. Pas les 18 260 localités du fond géographique —
--   elles ne sont pas des points qu'on va voir.
create or replace function public.stats_envies()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_object_agg(e.code, e.n), '{}'::jsonb)
         || jsonb_build_object(
              'gastronomie',  (select count(*) from public.dishes),
              'points_carte', (select count(*) from public.attractions
                                where is_published and lat is not null)
                            + (select count(*) from public.pages
                                where is_published and lat is not null),
              'adresses',     (select count(*) from public.pages where is_published)
            )
    from (
      select c.code,
             (select count(*) from public.attractions a
               where a.is_published
                 and a.kind = any(public.dk_kinds_envie(c.code))) as n
        from (values ('plage'),('trek'),('parcs'),('eaux'),('patrimoine')) as c(code)
    ) e;
$$;

grant execute on function public.stats_envies() to anon, authenticated;
