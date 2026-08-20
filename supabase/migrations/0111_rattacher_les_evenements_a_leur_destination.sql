-- ============================================================================
-- 0111 — AUCUN ÉVÉNEMENT N'ÉTAIT RATTACHÉ À UNE DESTINATION
--
-- 🔴 `place_id` était nul sur les 42. Conséquence : le calendrier existe, les
--    fiches de destination existent, et les deux s'ignorent. Personne, en lisant
--    la fiche de Sainte-Marie, n'apprend que les baleines à bosse passent de
--    juin à octobre — alors que c'est LA raison d'y aller à cette période.
--    L'information est en base, à un `join` de distance.
--
-- ⚠ LE RAPPROCHEMENT EST STRICT, ET C'EST DÉLIBÉRÉ. `lieu_libre` est du texte
--   libre : « Toamasina  et côte est », « Antananarivo et au-delà des Hautes
--   Terres », « Tout le pays ». On n'accepte que le nom EXACT d'une destination
--   touristique, placé en TÊTE, suivi d'une fin de chaîne ou d'un séparateur
--   franc. Jamais une sous-chaîne libre : ce projet a déjà rangé six îles sous
--   « Nosy Be » pour avoir cherché « nosy » n'importe où dans le nom.
--
-- 🔴 ET ON REFUSE TOUT CE QUI EST AMBIGU. Si un `lieu_libre` correspond à DEUX
--    destinations, on ne choisit pas : on laisse nul. Un événement rattaché au
--    mauvais endroit est pire qu'un événement non rattaché — il envoie quelqu'un
--    à 600 km, et rien à l'écran ne le contredit.
--
-- ⚠ `lieu_libre` EST CONSERVÉ, PAS REMPLACÉ. Il porte la nuance que le nom seul
--   perd : « et côte est », « et baie d'Antongil ». L'écran affiche le texte
--   libre et le rend cliquable vers la destination.
--
-- ⚠ « Sainte-Marie » tombe sur le slug `nosy-boraha` : c'est le même endroit,
--   sous ses deux noms. Vérifié à la main sur les 18 rapprochements.
--
-- Résultat : 18 événements rattachés, sur 11 destinations.
-- ============================================================================

do $$
declare n integer;
begin
  with candidats as (
    select e.id as evenement,
           min(p.id::text)::uuid as lieu,
           count(distinct p.id) as nb
      from public.events e
      join public.places p
        on p.merged_into is null and p.is_touristique and p.name_fr is not null
       and (
         lower(extensions.unaccent(trim(e.lieu_libre))) = lower(extensions.unaccent(trim(p.name_fr)))
         or lower(extensions.unaccent(trim(e.lieu_libre))) like lower(extensions.unaccent(trim(p.name_fr))) || ' %'
         or lower(extensions.unaccent(trim(e.lieu_libre))) like lower(extensions.unaccent(trim(p.name_fr))) || ',%'
         or lower(extensions.unaccent(trim(e.lieu_libre))) like lower(extensions.unaccent(trim(p.name_fr))) || ' /%'
       )
     where e.place_id is null and e.lieu_libre is not null
     group by e.id
  )
  update public.events e
     set place_id = c.lieu
    from candidats c
   -- ⚠ `nb = 1` : le garde-fou de l'ambiguïté. Deux destinations possibles, on
   --   n'en choisit aucune.
   where c.evenement = e.id and c.nb = 1;

  get diagnostics n = row_count;
  raise notice '0111 : % événement(s) rattaché(s) à une destination', n;
end $$;

do $$
declare
  v_lies integer;
  v_faux text;
begin
  select count(*) into v_lies from public.events where place_id is not null;
  if v_lies = 0 then
    raise exception '0111 : aucun événement rattaché — le rapprochement n''a rien trouvé';
  end if;

  -- ① CHAQUE RATTACHEMENT TIENT ENCORE SI ON LE REVÉRIFIE, dans l'autre sens.
  select string_agg(e.title || ' -> ' || p.name_fr, ' ; ') into v_faux
    from public.events e join public.places p on p.id = e.place_id
   where e.lieu_libre is not null
     and lower(extensions.unaccent(trim(e.lieu_libre)))
         not like lower(extensions.unaccent(trim(p.name_fr))) || '%';
  if v_faux is not null then
    raise exception '0111 : rattachement incohérent : %', v_faux;
  end if;

  -- ② AUCUN ÉVÉNEMENT NE POINTE SUR UN LIEU FUSIONNÉ OU NON TOURISTIQUE : ce
  --    serait un lien vers une fiche que /explorer ne montre pas.
  if exists (
    select 1 from public.events e join public.places p on p.id = e.place_id
     where p.merged_into is not null or not p.is_touristique
  ) then
    raise exception '0111 : un événement pointe vers un lieu fusionné ou non touristique';
  end if;

  -- ③ `lieu_libre` n'a pas été effacé : c'est lui qui porte la nuance.
  if exists (select 1 from public.events where place_id is not null and lieu_libre is null) then
    raise exception '0111 : un rattachement a effacé le lieu en texte libre';
  end if;

  raise notice '0111 : % événement(s) liés sur 42', v_lies;
end $$;
