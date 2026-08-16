-- ============================================================================
-- 0079 — UN ÉVÉNEMENT PEUT AVOIR UNE SAISON SANS AVOIR DE DATE
--
-- 🔴 `events.starts_on` EST `NOT NULL`, ET C'EST LE PROBLÈME. La plupart des
--    vrais rendez-vous malgaches n'ont pas de jour fixe :
--      · le Sômarôho de Nosy Be s'est tenu début août en 2025 et 2026, mais en
--        juillet en 2023 ;
--      · Madajazzcar est « en octobre », les dates 2026 ne sont pas publiées ;
--      · la saison des baleines court de juin à octobre ;
--      · la floraison des jacarandas dure trois semaines, sans date annonçable.
--
--    Exiger une date obligerait à en inventer une. La règle du projet
--    l'interdit, et surtout : un voyageur qui réserve un vol sur un faux
--    « 8 août » perd son voyage. Une fourchette honnête vaut mieux qu'une
--    précision fausse.
--
-- ⚠ D'OÙ `mois` ET `periode`. `mois` sert la MACHINE — c'est lui qui répond à
--   « qu'est-ce qui se passe en août ». `periode` sert l'HUMAIN : c'est la
--   phrase exacte qu'on affiche, avec ses réserves (« jour variable selon les
--   années », « édition 2026 non annoncée »).
--
-- ⚠ `source` EST OBLIGATOIRE POUR TOUT CE QU'ON INSÈRE. Un événement sans
--   source n'entre pas : c'est la seule barrière contre la donnée inventée, et
--   elle doit être structurelle, pas déclarative.
--
-- ⚠ `recurrent = false` EXISTE POUR LE FITAMPOHA. La cérémonie sakalava du
--   Menabe se tient environ tous les cinq ans : l'afficher chaque août serait
--   envoyer des gens à un événement qui n'a pas lieu.
-- ============================================================================

alter table public.events alter column starts_on drop not null;

alter table public.events add column if not exists mois smallint[] not null default '{}';
alter table public.events add column if not exists periode text;
alter table public.events add column if not exists source text;
alter table public.events add column if not exists confiance text;
alter table public.events add column if not exists recurrent boolean not null default true;
alter table public.events add column if not exists lieu_libre text;

alter table public.events drop constraint if exists events_confiance_check;
alter table public.events add constraint events_confiance_check
  check (confiance is null or confiance = any (array['certaine','periode_sure','incertaine']));

-- ⚠ LA BARRIÈRE CONTRE LA DONNÉE INVENTÉE, en base et non dans un commentaire.
alter table public.events drop constraint if exists events_source_obligatoire;
alter table public.events add constraint events_source_obligatoire
  check (source is not null and source <> '');

alter table public.events drop constraint if exists events_mois_valides;
alter table public.events add constraint events_mois_valides
  check (mois <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]);

comment on column public.events.mois is
  'Les mois concernes. Sert la MACHINE (« qu''est-ce qui se passe en aout ? »).';
comment on column public.events.periode is
  'La phrase affichee a l''HUMAIN, avec ses reserves. Ne jamais la remplacer par une date calculee.';
comment on column public.events.recurrent is
  'false = ne se repete PAS chaque annee (ex : Fitampoha, ~tous les 5 ans). Ne pas reconduire automatiquement.';

create index if not exists events_mois_idx on public.events using gin (mois);

-- ── Ce que « La saison en cours » demande ───────────────────────────────────
create or replace function public.saison_en_cours(p_mois smallint default null)
returns table (
  slug text, titre text, genre text, lieu text, region text,
  periode text, description text, source text, confiance text, recurrent boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.slug, e.title, e.kind,
         coalesce(pl.name_fr, e.lieu_libre), pl.region,
         e.periode, e.summary, e.source, e.confiance, e.recurrent
    from public.events e
    left join public.places pl on pl.id = e.place_id
   where e.is_published
     and coalesce(p_mois, extract(month from now())::smallint) = any (e.mois)
   order by
     -- ⚠ Ce qui est SÛR d'abord : afficher un « à confirmer » au-dessus d'une
     --   fête nationale ferait douter de l'ensemble du bloc.
     (e.confiance = 'certaine') desc,
     (e.kind = 'nature') desc,
     e.title;
$$;

revoke all on function public.saison_en_cours(smallint) from public, anon;
grant execute on function public.saison_en_cours(smallint) to anon, authenticated;

-- ── Porte d'import temporaire (supprimée en 0081) ───────────────────────────
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
      l->>'slug'                                as slug,
      l->>'titre'                               as title,
      l->>'genre'                               as kind,
      l->>'lieu'                                as lieu_libre,
      l->>'periode'                             as periode,
      l->>'description'                         as summary,
      l->>'source'                              as source,
      l->>'confiance'                           as confiance,
      coalesce((l->>'recurrent')::boolean, true) as recurrent,
      (select array_agg((m)::smallint)
         from jsonb_array_elements_text(l->'mois') as m)  as mois,
      -- ⚠ On rattache au referentiel QUAND ON PEUT, sans jamais forcer : un
      --   evenement dont le lieu n'existe pas au referentiel garde son nom en
      --   clair plutot que de disparaitre.
      (select p.id from public.places p
        where p.merged_into is null
          and public.dk_norm(p.name_fr) = public.dk_norm(l->>'lieu')
        order by p.is_touristique desc, (p.nb_pages + p.nb_posts) desc
        limit 1) as place_id
    from jsonb_array_elements(p_lignes) as l
  ),
  ins as (
    insert into public.events
      (slug, title, kind, place_id, lieu_libre, mois, periode, summary,
       source, confiance, recurrent, yearly, is_published, starts_on)
    select e.slug, e.title, e.kind, e.place_id, e.lieu_libre,
           coalesce(e.mois, '{}'), e.periode, e.summary,
           e.source, e.confiance, e.recurrent, e.recurrent, true, null
      from e
     where not exists (select 1 from public.events x where x.slug = e.slug)
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

revoke all on function public.import_evenements(text, jsonb) from public, anon;
grant execute on function public.import_evenements(text, jsonb) to authenticated, anon;;
