-- ============================================================================
-- 0112 — LA FICHE D'UNE DESTINATION IGNORAIT CE QUI S'Y PASSE
--
-- 🔴 Le calendrier existe (42 événements), les fiches de destination existent,
--    et les deux s'ignoraient. Personne, en lisant la fiche de Sainte-Marie,
--    n'apprenait que les baleines à bosse passent de juin à octobre — alors que
--    c'est LA raison d'y aller à cette période. Depuis 0111, l'information est
--    à un `join` de distance ; cette migration ouvre la porte.
--
-- ⚠ SEULES 5 DESTINATIONS SUR 508 ONT LEUR SAISONNALITÉ SAISIE. Les événements
--   rattachés en couvrent 11 de plus, avec une matière différente : pas « quel
--   mois est agréable », mais « ce qui arrive ce mois-là ». Sur une fiche
--   aujourd'hui presque vide, c'est le premier contenu réel.
--
-- ⚠ ON PATCHE UN FRAGMENT EXACT plutôt que de recopier la fonction entière :
--   `fiche_destination` fait une centaine de lignes et porte les saisons, les
--   accès, cinq compteurs et les récits. La recopier pour ajouter une clé, c'est
--   risquer d'en perdre une en chemin — et ça ne se verrait qu'à l'écran, plus
--   tard. On échoue bruyamment si le fragment n'est pas trouvé.
--
-- ⚠ L'ORDRE EST TOTAL : premier mois concerné, puis titre. Sans le titre en
--   départage, deux événements du même mois pourraient permuter d'un appel à
--   l'autre et la liste sauterait sous le doigt.
-- ============================================================================

do $$
declare
  v_def   text;
  v_avant constant text := '''lieu'', to_jsonb(p) - ''norm'',';
  v_apres constant text := '''lieu'', to_jsonb(p) - ''norm'','
    || E'\n    ''evenements'', (\n'
    || E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
    || E'               ''slug'', ev.slug, ''titre'', ev.title,\n'
    || E'               ''periode'', ev.periode, ''mois'', ev.mois,\n'
    || E'               ''annuel'', ev.yearly, ''resume'', ev.summary,\n'
    || E'               ''affiche'', ev.poster_url, ''credit'', ev.poster_credit,\n'
    || E'               ''lieu_libre'', ev.lieu_libre, ''source'', ev.source)\n'
    || E'             order by coalesce((select min(m) from unnest(ev.mois) m), 99), ev.title),\n'
    || E'             ''[]''::jsonb)\n'
    || E'        from public.events ev\n'
    || E'       where ev.place_id = p.id and ev.is_published\n'
    || E'    ),';
begin
  v_def := pg_get_functiondef('public.fiche_destination(text)'::regprocedure);

  if position(v_avant in v_def) = 0 then
    raise exception '0112 : le fragment attendu est absent de fiche_destination — la fonction a changé, relire avant de patcher';
  end if;
  if position('''evenements''' in v_def) > 0 then
    raise exception '0112 : fiche_destination rend déjà une clé evenements';
  end if;

  execute replace(v_def, v_avant, v_apres);
end $$;

-- ============================================================================
-- CONTRÔLE — la clé sort, elle est juste, et RIEN d'autre n'a bougé.
-- ============================================================================
do $$
declare
  v_slug    text;
  v         jsonb;
  v_attendu integer;
  v_rendu   integer;
  v_cles    integer;
begin
  -- ① Une destination qui porte des événements les rend tous.
  select p.slug into v_slug
    from public.places p join public.events e on e.place_id = p.id
   where e.is_published
   group by p.slug order by count(*) desc, p.slug limit 1;

  if v_slug is null then
    raise warning '0112 : aucun événement rattaché — contrôle impossible.';
    return;
  end if;

  v := public.fiche_destination(v_slug);
  if not (v ? 'evenements') then
    raise exception '0112 : fiche_destination ne rend pas la clé evenements';
  end if;

  select count(*) into v_attendu
    from public.events e join public.places p on p.id = e.place_id
   where p.slug = v_slug and e.is_published;
  v_rendu := jsonb_array_length(v -> 'evenements');
  if v_rendu <> v_attendu then
    raise exception '0112 : % — % événement(s) rendus, % en base', v_slug, v_rendu, v_attendu;
  end if;

  -- ② LES AUTRES CLÉS SONT TOUJOURS LÀ. C'est le risque réel d'un patch
  --    textuel : remplacer un fragment et emporter la suite sans s'en rendre
  --    compte. On vérifie nommément.
  select count(*) into v_cles
    from unnest(array['lieu','saisons','acces','nb_ou_dormir']) c
   where v ? c;
  if v_cles < 4 then
    raise exception '0112 : le patch a fait disparaître des clés de fiche_destination (% sur 4 présentes)', v_cles;
  end if;

  -- ③ Une destination SANS événement rend un tableau vide, pas null : l'écran
  --    doit pouvoir faire `.length` sans garde.
  select p.slug into v_slug from public.places p
   where p.is_touristique and p.merged_into is null
     and not exists (select 1 from public.events e where e.place_id = p.id)
   order by p.slug limit 1;
  if v_slug is not null then
    v := public.fiche_destination(v_slug);
    if (v -> 'evenements') is null or jsonb_typeof(v -> 'evenements') <> 'array' then
      raise exception '0112 : une destination sans événement ne rend pas un tableau vide';
    end if;
  end if;
end $$;
