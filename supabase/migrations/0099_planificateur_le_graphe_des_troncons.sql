-- ============================================================================
-- 0099 — LE PLANIFICATEUR, ① : LE GRAPHE DES TRONÇONS RELEVÉS
--
-- La page « Y aller » sait dire, pour 42 destinations, la distance et la durée
-- RÉELLE depuis un point de départ. Elle ne sait pas répondre à la seule
-- question que se pose vraiment quelqu'un qui prépare sa route :
-- « je pars d'Antananarivo à 6 h pour Toliara — j'arrive quand, et où
--   est-ce que je dors ? »
--
-- Ce n'est pas une donnée qui manque, c'est une LECTURE. Les 42 lignes de
-- `place_access` ne forment pas une liste : elles forment un GRAPHE de 43
-- sommets et 42 arêtes. Mis bout à bout, les sept tronçons de la RN7 donnent
-- 941 km et 19,5 h — à comparer à la ligne « Antananarivo → Toliara » prise
-- d'un bloc, qui dit 950 km et 20 h. Les deux versions du même trajet se
-- confirment à 1 % près, et c'est cette concordance que l'écran montre.
--
-- ⚠ CE QUE CETTE FONCTION NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : compléter.
--   Aucune durée déduite d'une vitesse moyenne, aucun tronçon reconstitué par
--   soustraction (Ranohira → Zombitse 1,5 h et Ranohira → Toliara 4,5 h ne
--   donnent PAS un Zombitse → Toliara de 3 h : ce serait un nombre inventé, et
--   c'est exactement ce qui envoie quelqu'un rouler de nuit). La fonction rend
--   le relevé, rien que le relevé ; le client se charge de dire ce qu'il ne
--   couvre pas.
--
-- ⚠ ON REND LE GRAPHE ENTIER EN UN SEUL ALLER-RETOUR, pas un itinéraire.
--   43 sommets et 42 arêtes tiennent en ~13 ko : le calcul de chemin coûte
--   moins cher dans le navigateur qu'un aller-retour de plus sur une 3G
--   malgache, et il permet de recalculer instantanément quand la personne
--   change son heure de départ — ce qu'elle fait trois fois de suite.
--
-- ⚠ SECURITY DEFINER, DONC INSENSIBLE AUX GRANTS PAR COLONNE DE `places`.
--   `anon` n'a sur cette table que des droits colonne par colonne ; une lecture
--   directe casserait au premier ajout de colonne. La fonction lit en tant que
--   propriétaire et ne rend que six champs choisis — aucun `select *`.
-- ============================================================================

create or replace function public.trajet_referentiel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(

    -- ── Les sommets : uniquement les lieux qui portent un tronçon relevé ────
    --    Le référentiel compte 22 707 lieux ; 43 seulement ont un accès mesuré.
    --    Proposer les 22 664 autres dans un champ « départ » serait promettre un
    --    itinéraire qu'on n'a pas.
    'lieux', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug',   p.slug,
               'nom',    p.name_fr,
               'region', p.region,
               'kind',   p.kind,
               -- Les coordonnées ne servent pas à mesurer une route : elles
               -- servent à calculer l'heure du COUCHER DU SOLEIL sur place.
               -- Trois lieux sur 43 ne les ont pas ; le client dit « inconnu »
               -- plutôt que d'appliquer l'horaire d'ailleurs.
               'lat',    p.lat,
               'lng',    p.lng,
               -- De quoi choisir où couper la journée : dormir à Ambalavao
               -- (4 adresses relevées) n'est pas dormir à Zombitse (aucune).
               'nb_hotels', (
                 select count(*) from public.pages g
                  where g.place_id = p.id and g.is_published
                    and 'hotel' = any(g.categories)),
               'nb_restaurants', (
                 select count(*) from public.pages g
                  where g.place_id = p.id and g.is_published
                    and 'restaurant' = any(g.categories)))
             order by p.slug)
        from public.places p
       where exists (select 1 from public.place_access a
                      where a.place_id = p.id or a.from_place_id = p.id)
    ), '[]'::jsonb),

    -- ── Les arêtes : les 42 lignes, telles quelles ─────────────────────────
    'acces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'depuis',      o.slug,
               'vers',        d.slug,
               'mode',        a.mode,
               'km',          a.distance_km,
               'heures',      a.duration_h,
               'etat',        a.road_state,
               'toute_annee', a.all_year,
               'operateurs',  a.operators,
               'prix_ar',     a.price_ar)
             -- Ordre TOTAL. Deux tronçons peuvent relier la même paire par des
             -- modes différents (Toliara → Anakao en bateau) : sans le mode au
             -- départage, l'ordre pourrait changer d'un appel à l'autre et
             -- l'itinéraire affiché avec lui.
             order by o.slug, d.slug, a.mode)
        from public.place_access a
        join public.places o on o.id = a.from_place_id
        join public.places d on d.id = a.place_id
    ), '[]'::jsonb)
  );
$$;

comment on function public.trajet_referentiel() is
  'Graphe complet des tronçons relevés (place_access) : sommets avec coordonnées et nombre d''adresses, arêtes avec distance, durée réelle et état de route. Sert au planificateur de /y-aller. Ne complète jamais un tronçon manquant.';

revoke execute on function public.trajet_referentiel() from public;
grant  execute on function public.trajet_referentiel() to anon, authenticated;

-- ── Contrôle : le graphe rendu est COMPLET et REFERMÉ SUR LUI-MÊME ─────────
--    Un tronçon dont une extrémité manque dans « lieux » serait ignoré EN
--    SILENCE par le client : l'itinéraire deviendrait faux sans qu'aucune
--    erreur n'apparaisse nulle part. C'est précisément le défaut qu'on refuse.
do $$
declare
  v jsonb;
  v_nb_acces integer;
  v_nb_lieux integer;
  v_orphelins integer;
  v_sans_duree integer;
begin
  v := public.trajet_referentiel();

  select count(*) into v_nb_acces from public.place_access;
  select count(*) into v_nb_lieux from public.places p
   where exists (select 1 from public.place_access a
                  where a.place_id = p.id or a.from_place_id = p.id);

  if jsonb_array_length(v -> 'acces') <> v_nb_acces then
    raise exception '0099 : % tronçons en base, % rendus par la fonction',
      v_nb_acces, jsonb_array_length(v -> 'acces');
  end if;

  if jsonb_array_length(v -> 'lieux') <> v_nb_lieux then
    raise exception '0099 : % lieux concernés en base, % rendus',
      v_nb_lieux, jsonb_array_length(v -> 'lieux');
  end if;

  if v_nb_acces = 0 or v_nb_lieux = 0 then
    raise exception '0099 : le graphe est vide — le planificateur n''aurait rien à afficher';
  end if;

  select count(*) into v_orphelins
    from jsonb_array_elements(v -> 'acces') a
   where not exists (
           select 1 from jsonb_array_elements(v -> 'lieux') l
            where l ->> 'slug' = a ->> 'depuis')
      or not exists (
           select 1 from jsonb_array_elements(v -> 'lieux') l
            where l ->> 'slug' = a ->> 'vers');
  if v_orphelins > 0 then
    raise exception '0099 : % tronçon(s) pointent vers un lieu absent de la liste des sommets', v_orphelins;
  end if;

  -- Pas une erreur : un état des lieux. Un tronçon sans durée relevée est
  -- écarté du calcul d'horaire côté client (jamais estimé) — autant que la
  -- migration le dise à voix haute le jour où il en apparaîtra un.
  select count(*) into v_sans_duree
    from jsonb_array_elements(v -> 'acces') a
   where a ->> 'heures' is null or (a ->> 'heures')::numeric <= 0;
  if v_sans_duree > 0 then
    raise warning '0099 : % tronçon(s) sans durée relevée — exclus du calcul d''horaire, jamais estimés', v_sans_duree;
  end if;

  if not has_function_privilege('anon', 'public.trajet_referentiel()', 'execute') then
    raise exception '0099 : anon ne peut pas exécuter trajet_referentiel() — la page /y-aller resterait vide';
  end if;
end $$;
