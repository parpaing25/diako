-- ============================================================================
-- 0104 — LE CRÉDIT D'UNE AFFICHE D'ÉVÉNEMENT, STOCKÉ AVEC L'ÉVÉNEMENT
--
-- 🔴 POURQUOI CES COLONNES. Les 42 événements vont recevoir des affiches de
--    Wikimedia Commons (moissonneur scripts/photos_evenements.py). Commons
--    héberge du CC BY, du CC BY-SA, du GFDL et du domaine public : les trois
--    premières licences EXIGENT de nommer l'auteur ET la licence. Sans colonne
--    pour les porter, une affiche posée n'est pas « gratuite », elle est en
--    infraction — même règle que 0049 sur `attractions`, 0082 sur `places`,
--    0096 sur `dishes` et 0098 sur `pages`.
--
-- ⚠ LE PIÈGE 0082 EST VÉRIFIÉ, PAS SUPPOSÉ. Sur `places`, `anon` n'avait que
--   des grants PAR COLONNE : une colonne ajoutée n'héritait de rien et cassait
--   la lecture pour tout le monde. On ne sait pas de mémoire dans quel régime
--   est `events` — alors on pose le `grant select (...)` explicite, inoffensif
--   si la table a un grant global, indispensable sinon, et l'assertion le PROUVE
--   dans les deux cas. Cette semaine encore, 0103 a montré ce que coûte de ne
--   pas rejouer ce contrôle : une seule colonne sans droit avait rendu le
--   profil illisible pour tous les membres connectés.
--
-- ⚠ AUCUN DROIT D'ÉCRITURE ACCORDÉ. Poser une affiche reste un acte
--   d'administration, comme le reste du référentiel.
-- ============================================================================

alter table public.events add column if not exists poster_credit  text;
alter table public.events add column if not exists poster_licence text;
alter table public.events add column if not exists poster_source  text;

grant select (poster_credit, poster_licence, poster_source)
  on public.events to anon, authenticated;

do $$
begin
  if not has_column_privilege('anon', 'public.events', 'poster_credit', 'select')
     or not has_column_privilege('authenticated', 'public.events', 'poster_credit', 'select') then
    raise exception '0104 : les colonnes de crédit de events ne sont pas lisibles — piège 0082';
  end if;

  -- ⚠ Rien ne doit déjà être posé sans attribution : si une affiche existait
  --   avant cette migration, elle serait publiée sans son auteur.
  if exists (
    select 1 from public.events
     where poster_url is not null
       and (poster_credit is null or poster_licence is null or poster_source is null)
  ) then
    raise exception '0104 : une affiche est déjà posée sans attribution complète';
  end if;
end $$;
