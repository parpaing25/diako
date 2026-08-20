-- ============================================================================
-- 0106 — RECONNAÎTRE UN ÉTABLISSEMENT PENDANT QU'ON TAPE SON NOM
--
-- 🔴 CE QUE ÇA ÉVITE : LE DOUBLON QUE PERSONNE NE PEUT PLUS DÉFAIRE. L'annuaire
--    porte 3 254 établissements publiés, importés d'OpenStreetMap et de
--    Wikivoyage. Un gérant qui ouvre l'assistant tape le nom de SON hôtel — qui
--    a de bonnes chances d'y être déjà — et crée une SECONDE fiche. À partir de
--    là il y a deux pages pour un même lieu : les avis sur l'une, les tarifs sur
--    l'autre, et les deux remontent dans la recherche. C'est exactement le
--    genre de dégât que 0060 et 0087 ont dû réparer après coup, à la main.
--
--    Le propriétaire l'a demandé en ces termes : « saisie dynamique, suggestions
--    d'établissements existants, et si c'est une revendication, pré-remplir le
--    lieu et le repère ».
--
-- ⚠ POURQUOI UNE FONCTION PLUTÔT QU'UN `ilike` CÔTÉ CLIENT. `pages` est en
--   grants PAR COLONNE : une lecture directe casse au premier ajout de colonne
--   (piège 0082, repayé en 0103 sur `profiles` cette semaine encore). Une
--   fonction `security definer` lit sous son propriétaire et ne rend que les
--   sept champs choisis — jamais `select *`.
--
-- 🔴 ET SURTOUT : ELLE NE DIT PAS QUI POSSÈDE QUOI. Elle rend un booléen
--    `deja_revendique`, jamais `owner_id`. Rendre l'identifiant du gérant
--    permettrait, en tapant des noms au hasard, de dresser la liste des membres
--    qui tiennent un établissement — une énumération que 0073 a précisément
--    fermée sur les profils. Le booléen suffit à l'écran : il décide entre
--    « revendiquer » et « déjà pris ».
--
-- ⚠ `norm` EST DÉJÀ LÀ, ON S'EN SERT. La colonne porte le nom normalisé sans
--   accents, et un index l'accompagne depuis 0063 : chercher dessus évite un
--   `unaccent(name)` recalculé sur 3 254 lignes à chaque frappe.
-- ============================================================================

create or replace function public.chercher_etablissements_par_nom(
  p_terme  text,
  p_limite integer default 6
)
returns table (
  slug            text,
  nom             text,
  sous_categorie  text,
  categories      text[],
  repere          text,
  place_id        uuid,
  lieu_nom        text,
  deja_revendique boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_t text := lower(unaccent(trim(coalesce(p_terme, ''))));
begin
  -- ⚠ DEUX CARACTÈRES NE CHERCHENT RIEN. « Le » ou « Ho » rendraient des
  --   centaines de lignes sans rapport, à chaque frappe, sur une 3G.
  if char_length(v_t) < 3 then
    return;
  end if;

  return query
    select g.slug, g.name, g.subcategory, g.categories, g.landmark,
           g.place_id, p.name_fr,
           g.owner_id is not null
      from public.pages g
      left join public.places p on p.id = g.place_id
     where g.is_published
       and g.norm like '%' || v_t || '%'
     -- ⚠ Ce qui COMMENCE par le terme d'abord : on tape le début d'un nom, pas
     --   son milieu. Puis les fiches les mieux renseignées, puis un départage
     --   stable par slug — sans lui, deux appels identiques peuvent rendre deux
     --   ordres différents et la liste sauterait sous le doigt.
     order by (g.norm like v_t || '%') desc, g.completeness desc, g.slug
     limit least(greatest(coalesce(p_limite, 6), 1), 12);
end $$;

comment on function public.chercher_etablissements_par_nom(text, integer) is
  'Suggestions d''établissements publiés dont le nom contient le terme. Sert à éviter les doublons dans l''assistant de création : si la fiche existe, on propose de la revendiquer. Ne rend jamais owner_id, seulement un booléen.';

revoke all on function public.chercher_etablissements_par_nom(text, integer) from public, anon;
grant execute on function public.chercher_etablissements_par_nom(text, integer) to authenticated;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare
  v_nom  text;
  v_frag text;
  n      integer;
begin
  -- ① Un terme trop court ne rend rien — la garde tient.
  if (select count(*) from public.chercher_etablissements_par_nom('ho', 6)) > 0 then
    raise exception '0106 : un terme de 2 caracteres a rendu des resultats';
  end if;

  -- ② Un nom réel, cherché par un fragment de lui-même, se retrouve.
  select g.name into v_nom
    from public.pages g
   where g.is_published and char_length(g.name) between 8 and 40
   order by g.completeness desc, g.slug
   limit 1;

  if v_nom is null then
    raise notice '0106 : aucun etablissement publie — controle partiel.';
  else
    v_frag := lower(unaccent(substr(v_nom, 1, 6)));
    select count(*) into n from public.chercher_etablissements_par_nom(v_frag, 12);
    if n = 0 then
      raise exception '0106 : « % » ne retrouve pas « % » — la recherche par nom est muette', v_frag, v_nom;
    end if;
  end if;

  -- ③ AUCUNE FICHE NON PUBLIÉE NE SORT. Une fiche dépubliée ressemble en tout
  --    point à une fiche publiée dans une liste de suggestions.
  select count(*) into n
    from public.chercher_etablissements_par_nom(coalesce(v_frag, 'hotel'), 12) s
    join public.pages g on g.slug = s.slug
   where not g.is_published;
  if n > 0 then
    raise exception '0106 : % fiche(s) non publiee(s) proposee(s) en suggestion', n;
  end if;

  -- ④ Les droits : `anon` n'a rien à faire ici — cette liste sert à créer une
  --    fiche, ce qu'un visiteur non connecté ne peut pas faire.
  if has_function_privilege('anon', 'public.chercher_etablissements_par_nom(text, integer)', 'execute') then
    raise exception '0106 : anon peut enumerer l''annuaire par nom';
  end if;
  if not has_function_privilege('authenticated', 'public.chercher_etablissements_par_nom(text, integer)', 'execute') then
    raise exception '0106 : un compte connecte ne peut pas appeler la recherche par nom';
  end if;
end $$;
