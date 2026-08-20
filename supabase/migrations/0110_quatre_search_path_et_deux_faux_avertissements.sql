-- ============================================================================
-- 0110 — QUATRE `search_path` OUVERTS, ET DEUX AVERTISSEMENTS QUI N'EN SONT PAS
--
-- ⚠ CE QUE DIT LE LINTER DE SUPABASE, ET CE QUI EST VRAI. Quatre fonctions sont
--   signalées « role mutable search_path » : `dk_grande_region`,
--   `dk_kinds_envie`, `dk_libelle_type`, `projet_statut_effectif`.
--
--   VÉRIFIÉ AVANT DE CORRIGER : aucune des quatre n'est `security definer`
--   (`prosecdef = false`) et toutes sont `immutable`. Elles s'exécutent donc
--   sous le rôle APPELANT, sur du texte, sans toucher une table : le risque
--   d'escalade que ce linter cherche n'existe pas ici. L'avertissement est
--   formel.
--
--   On le referme quand même, pour deux raisons. D'abord parce qu'un
--   avertissement qu'on sait faux use la liste : au bout de quatre, on ne lit
--   plus les suivants — et le cinquième sera vrai. Ensuite parce qu'une de ces
--   fonctions, `dk_grande_region`, est appelée DANS la vue `sites_localises` :
--   si quelqu'un la passe un jour en `security definer` sans y penser, le trou
--   s'ouvrirait en silence. Le `search_path` posé aujourd'hui le ferme d'avance.
--
-- ⚠ `alter function ... set search_path` PLUTÔT QU'UN `create or replace` : on
--   ne réécrit pas quatre corps de fonction pour ajouter une clause. Moins de
--   texte recopié, donc moins d'occasions d'en perdre une ligne au passage.
--
-- 🔴 ET DEUX AVERTISSEMENTS QU'IL NE FAUT PAS « CORRIGER ». `agent_memories` et
--    `agent_rate` sont signalées « RLS enabled, but no policies exist ». C'est
--    exact, et c'est VOULU : vérifié, ni `anon` ni `authenticated` n'ont le
--    moindre droit dessus — ni select, ni insert. RLS active SANS politique est
--    l'état le plus fermé qui soit : personne ne passe, sauf `service_role`, qui
--    contourne RLS par construction. C'est exactement ce que doit être la
--    mémoire d'un agent.
--
--    Le piège serait de lire l'avertissement comme une consigne et d'ajouter une
--    policy « pour faire propre » : cela OUVRIRAIT deux tables aujourd'hui
--    hermétiques. Le commentaire posé ci-dessous vit dans la base, là où
--    quelqu'un le lira avant d'agir.
-- ============================================================================

alter function public.dk_grande_region(text)              set search_path = public;
alter function public.dk_kinds_envie(text)                set search_path = public;
alter function public.dk_libelle_type(text)               set search_path = public;
alter function public.projet_statut_effectif(text, date)  set search_path = public;

comment on table public.agent_memories is
  'Mémoire de l''agent. RLS active SANS aucune policy, et sans aucun grant à anon ni authenticated : c''est l''état le plus fermé possible, atteignable seulement par service_role. Le linter le signale comme un oubli — ce n''en est pas un. NE PAS ajouter de policy : cela ouvrirait la table.';

comment on table public.agent_rate is
  'Compteur de débit de l''agent. Même régime que agent_memories : RLS active, aucune policy, aucun grant client. NE PAS ajouter de policy.';

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare
  v_ouvertes text;
  v_grants   text;
begin
  -- ① Les quatre portent bien leur search_path.
  select string_agg(p.proname, ', ') into v_ouvertes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('dk_grande_region','dk_kinds_envie','dk_libelle_type','projet_statut_effectif')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%'
     );
  if v_ouvertes is not null then
    raise exception '0110 : search_path toujours ouvert sur : %', v_ouvertes;
  end if;

  -- ② LES DEUX TABLES DE L'AGENT SONT TOUJOURS HERMÉTIQUES. C'est le contrôle
  --    qui compte : il échouera le jour où quelqu'un « corrigera » le linter.
  select string_agg(t || ' (' || r || ')', ', ') into v_grants
    from unnest(array['agent_memories','agent_rate']) t
    cross join unnest(array['anon','authenticated']) r
   where has_table_privilege(r, 'public.' || t, 'select')
      or has_table_privilege(r, 'public.' || t, 'insert')
      or has_table_privilege(r, 'public.' || t, 'update')
      or has_table_privilege(r, 'public.' || t, 'delete');
  if v_grants is not null then
    raise exception '0110 : les tables de l''agent ont reçu des droits clients : %', v_grants;
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('agent_memories','agent_rate')
  ) then
    raise exception '0110 : une policy a été ajoutée sur les tables de l''agent — elle OUVRE ce qui était fermé';
  end if;
end $$;
