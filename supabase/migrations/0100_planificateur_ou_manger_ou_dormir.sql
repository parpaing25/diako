-- ============================================================================
-- 0100 — LE PLANIFICATEUR, ② : OÙ S'ARRÊTER SUR LE TRAJET
--
-- Une fois l'itinéraire découpé jour par jour (migration 0099 + calcul côté
-- client), il reste la question qui décide vraiment du voyage : la nuit tombe
-- à 17 h 38 et je suis à Ambalavao — il y a quoi, à Ambalavao ?
--
-- La réponse existe déjà en base et n'a jamais été rapprochée du trajet :
-- 3 254 fiches publiées portent `place_id`. Ambalavao en a 4, Fianarantsoa 85,
-- Ihosy 2, Zombitse aucune. C'est cette dernière information — AUCUNE — qui
-- vaut le plus : elle dit de ne pas prévoir d'y dormir.
--
-- ⚠ CE QU'ON NE REND PAS, ET POURQUOI :
--   · pas de prix. `price_min_ar` n'est renseigné que sur 38 fiches sur 3 254,
--     et la règle du projet veut qu'un montant ne voyage jamais sans son unité,
--     sa base et sa date de dernière confirmation — avec déclassement au-delà
--     de six mois. Cette discipline est déjà tenue sur la fiche `/p/<slug>` ;
--     la redire ici, c'est deux endroits où elle peut diverger. Le planificateur
--     nomme l'adresse et y renvoie.
--   · pas de note ni d'avis : il y a 0 avis en base.
--   · pas de photo : `cover_url` est nul sur les 3 254 fiches. Une vignette
--     grise ne dit rien de plus qu'une ligne de texte, et coûte une requête.
--
-- ⚠ AUCUN CLASSEMENT SUBJECTIF. L'ordre est `completeness` décroissante — un
--   score déjà calculé par déclencheur à partir de champs remplis — puis le nom,
--   puis le slug. Ordre TOTAL : la même étape rend toujours la même liste.
--   Ce n'est pas un palmarès, c'est « les fiches les plus renseignées d'abord »,
--   et l'écran le dit.
--
-- ⚠ TOP N, PAS DE PAGINATION. On ne pagine pas une liste d'appoint : on en
--   montre quelques-unes et on renvoie vers la recherche, qui, elle, pagine par
--   curseur. Aucun `offset` n'apparaît ici.
-- ============================================================================

-- ── L'extraction d'une catégorie pour un lieu ──────────────────────────────
--    Isolée pour que l'ordre de tri soit écrit UNE fois : deux copies de la
--    même clause `order by` finissent toujours par diverger.
create or replace function public.dk_trajet_adresses(
  p_place     uuid,
  p_categorie text,
  p_n         integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug',         t.slug,
           'nom',          t.name,
           'sous_categorie', t.subcategory,
           'repere',       t.landmark,
           'telephone',    t.phone,
           'whatsapp',     t.whatsapp,
           'verification', t.verification_status)
         order by t.completeness desc, t.name, t.slug), '[]'::jsonb)
    from (
      select g.slug, g.name, g.subcategory, g.landmark, g.phone, g.whatsapp,
             g.verification_status, g.completeness
        from public.pages g
       where g.place_id = p_place
         and g.is_published
         and p_categorie = any(g.categories)
       order by g.completeness desc, g.name, g.slug
       -- Borne dure : un appel malicieux ne doit pas pouvoir se servir de cette
       -- fonction pour aspirer l'annuaire lieu par lieu.
       limit greatest(1, least(coalesce(p_n, 6), 12))
    ) t;
$$;

comment on function public.dk_trajet_adresses(uuid, text, integer) is
  'Quelques adresses publiées d''une catégorie pour un lieu, les fiches les mieux renseignées d''abord. Auxiliaire de trajet_etapes ; pas d''accès direct.';

-- ⚠ Auxiliaire : elle n'est jamais appelée depuis le réseau. Sans révocation,
--   PostgREST l'exposerait comme une RPC de plus.
revoke all on function public.dk_trajet_adresses(uuid, text, integer) from public, anon, authenticated;

-- ── Les étapes d'un itinéraire ─────────────────────────────────────────────
-- ⚠ ON SUPPRIME AVANT DE CRÉER. `create or replace` ne sait pas changer un type
--   de retour (42P13), et deux surcharges du même nom rendent la fonction
--   inappelable par PostgREST (PGRST203 / erreur 300). Le seul geste sûr quand
--   une signature bouge est un `drop` explicite de CHAQUE forme.
drop function if exists public.trajet_etapes(text[]);
drop function if exists public.trajet_etapes(text[], integer);

create or replace function public.trajet_etapes(
  p_slugs    text[],
  p_par_lieu integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', l.slug,
           -- Les compteurs sont rendus À PART des listes : « 85 adresses, en
           -- voici 6 » et « 6 adresses, les voici » ne se disent pas pareil, et
           -- la personne qui cherche où dormir a besoin de savoir laquelle des
           -- deux phrases elle lit.
           'nb_hotels', (
             select count(*) from public.pages g
              where g.place_id = l.id and g.is_published
                and 'hotel' = any(g.categories)),
           'nb_restaurants', (
             select count(*) from public.pages g
              where g.place_id = l.id and g.is_published
                and 'restaurant' = any(g.categories)),
           'dormir', public.dk_trajet_adresses(l.id, 'hotel', p_par_lieu),
           'manger', public.dk_trajet_adresses(l.id, 'restaurant', p_par_lieu))
         order by l.slug), '[]'::jsonb)
    from (
      select p.id, p.slug
        from public.places p
       where p.slug = any(coalesce(p_slugs, '{}'::text[]))
         -- ⚠ RESTREINT AUX SOMMETS DU GRAPHE. Sans ce filtre, la fonction
         --   devient un énumérateur de l'annuaire sur les 22 707 lieux du
         --   référentiel — ce n'est pas ce qu'on ouvre à `anon`.
         and exists (select 1 from public.place_access a
                      where a.place_id = p.id or a.from_place_id = p.id)
       order by p.slug
       limit 40
    ) l;
$$;

comment on function public.trajet_etapes(text[], integer) is
  'Pour les étapes d''un itinéraire (slugs de lieux du graphe des accès) : combien d''hôtels et de restaurants publiés, et quelques-uns d''entre eux. Sert au planificateur de /y-aller.';

revoke execute on function public.trajet_etapes(text[], integer) from public;
grant  execute on function public.trajet_etapes(text[], integer) to anon, authenticated;

-- ── Contrôle ───────────────────────────────────────────────────────────────
do $$
declare
  v_slugs   text[];
  v jsonb;
  v_attendu integer;
  v_rendu   integer;
  v_slug    text;
  v_fuites  integer;
begin
  select array_agg(p.slug order by p.slug) into v_slugs
    from public.places p
   where exists (select 1 from public.place_access a
                  where a.place_id = p.id or a.from_place_id = p.id);

  if v_slugs is null then
    raise exception '0100 : aucun lieu du graphe des accès — le planificateur n''aurait aucune étape';
  end if;

  -- ① Un lieu du graphe = une entrée, sans doublon ni disparition.
  v := public.trajet_etapes(v_slugs, 6);
  if jsonb_array_length(v) <> least(array_length(v_slugs, 1), 40) then
    raise exception '0100 : % lieux demandés, % rendus (plafond 40)',
      array_length(v_slugs, 1), jsonb_array_length(v);
  end if;

  -- ② Le compteur dit la vérité : on le recalcule sur le lieu le plus fourni.
  -- ⚠ Le candidat est pris DANS LA RÉPONSE, pas dans la table. Le graphe compte
  --   43 lieux et la fonction en plafonne 40 : choisir dans la table pourrait
  --   désigner un des trois écartés, et le contrôle échouerait pour une raison
  --   qui n'a rien à voir avec ce qu'il teste.
  select e ->> 'slug' into v_slug
    from jsonb_array_elements(v) e
   order by (e ->> 'nb_hotels')::integer desc, e ->> 'slug'
   limit 1;

  select count(*) into v_attendu from public.pages g
    join public.places p on p.id = g.place_id
   where p.slug = v_slug and g.is_published and 'hotel' = any(g.categories);

  select (e ->> 'nb_hotels')::integer into v_rendu
    from jsonb_array_elements(v) e where e ->> 'slug' = v_slug;

  if v_rendu is distinct from v_attendu then
    raise exception '0100 : %, nb_hotels rendu = %, compté en base = %',
      v_slug, v_rendu, v_attendu;
  end if;

  -- ③ AUCUNE FICHE NON PUBLIÉE NE SORT. C'est le seul défaut de cette
  --    migration qui serait invisible à l'écran : une adresse dépubliée
  --    ressemble en tout point à une adresse publiée.
  select count(*) into v_fuites
    from jsonb_array_elements(v) e
    cross join lateral jsonb_array_elements(
                 coalesce(e -> 'dormir', '[]'::jsonb) ||
                 coalesce(e -> 'manger', '[]'::jsonb)) as f(x)
    join public.pages g on g.slug = f.x ->> 'slug'
   where not g.is_published;
  if v_fuites > 0 then
    raise exception '0100 : % fiche(s) non publiée(s) rendue(s) par trajet_etapes', v_fuites;
  end if;

  -- ④ Un lieu hors graphe ne passe pas.
  if jsonb_array_length(public.trajet_etapes(array['ce-slug-n-existe-pas'], 6)) <> 0 then
    raise exception '0100 : un slug inconnu a produit une étape';
  end if;

  -- ⑤ Les droits.
  if not has_function_privilege('anon', 'public.trajet_etapes(text[], integer)', 'execute') then
    raise exception '0100 : anon ne peut pas exécuter trajet_etapes()';
  end if;
  if has_function_privilege('anon', 'public.dk_trajet_adresses(uuid, text, integer)', 'execute') then
    raise exception '0100 : l''auxiliaire dk_trajet_adresses est exposée à anon';
  end if;

  if (select count(*) from public.pages where not is_published) = 0 then
    raise warning '0100 : aucune fiche dépubliée en base — le contrôle ③ n''a rien pu écarter.';
  end if;
end $$;
