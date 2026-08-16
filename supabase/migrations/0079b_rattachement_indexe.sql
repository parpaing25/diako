-- ============================================================================
-- 0079b — L'IMPORT EXPIRAIT SUR LE RATTACHEMENT AU RÉFÉRENTIEL
--
-- ⚠ `public.dk_norm(p.name_fr) = ...` ne peut utiliser AUCUN index : la
--   fonction est appliquée à la colonne, donc Postgres normalise les 18 345
--   lieux pour chaque événement. Quarante-deux fois. D'où le 57014.
--
-- ⚠ `places.norm` EST DÉJÀ CETTE VALEUR, calculée à l'écriture (colonne
--   générée). Il suffisait de la lire. L'index trigramme existant sert la
--   recherche approchée, pas l'égalité : on ajoute un btree.
-- ============================================================================

create index if not exists places_norm_egal_idx
  on public.places (norm) where merged_into is null;

create or replace function public.import_evenements(p_jeton text, p_lignes jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if p_jeton is distinct from 'ev-2026-08-16-diako' then
    raise exception 'jeton invalide';
  end if;

  with e as (
    select
      l->>'slug'                                 as slug,
      l->>'titre'                                as title,
      l->>'genre'                                as kind,
      l->>'lieu'                                 as lieu_libre,
      l->>'periode'                              as periode,
      l->>'description'                          as summary,
      l->>'source'                               as source,
      l->>'confiance'                            as confiance,
      coalesce((l->>'recurrent')::boolean, true) as recurrent,
      (select array_agg((m)::smallint)
         from jsonb_array_elements_text(l->'mois') as m) as mois,
      public.dk_norm(l->>'lieu')                 as lieu_norm
    from jsonb_array_elements(p_lignes) as l
  ),
  situe as (
    select e.*,
           -- ⚠ On compare `p.norm` (colonne generee, indexee) et non
           --   `dk_norm(p.name_fr)` : la fonction sur la colonne interdit
           --   l'index et forcait un balayage complet.
           (select p.id from public.places p
             where p.merged_into is null and p.norm = e.lieu_norm
             order by p.is_touristique desc, (p.nb_pages + p.nb_posts) desc
             limit 1) as place_id
      from e
  ),
  ins as (
    insert into public.events
      (slug, title, kind, place_id, lieu_libre, mois, periode, summary,
       source, confiance, recurrent, yearly, is_published, starts_on)
    select s.slug, s.title, s.kind, s.place_id, s.lieu_libre,
           coalesce(s.mois, '{}'), s.periode, s.summary,
           s.source, s.confiance, s.recurrent, s.recurrent, true, null
      from situe s
     where not exists (select 1 from public.events x where x.slug = s.slug)
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;;
