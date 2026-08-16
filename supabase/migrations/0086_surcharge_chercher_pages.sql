-- ============================================================================
-- 0086 — DEUX `chercher_pages` VIVAIENT ENCORE : LA MÊME MINE QU'EN 0078
--
-- 🔴 DÉFAUT LATENT, VÉRIFIÉ SUR CETTE BASE. `public.chercher_pages` existait en
--    DEUX exemplaires :
--      · 7 arguments  — créée en 0008 (recherche d'origine, 16 colonnes rendues) ;
--      · 8 arguments  — `p_equipements text[]` ajouté en 0014, puis reconstruite
--        en 0030 pour porter `lat`, `lng` et `precision_geo` (19 colonnes).
--    0014 a fait un `create or replace` avec un paramètre EN PLUS : ce n'est pas
--    un remplacement, c'est une fonction NOUVELLE. Celle de 0008 n'est jamais
--    partie, et personne ne s'en est aperçu pendant soixante-douze migrations.
--
-- 🔴 CE QUE ÇA CASSAIT DÉJÀ, ET POURQUOI CE N'ÉTAIT PAS THÉORIQUE. Les DEUX
--    versions ont une valeur par défaut sur CHACUN de leurs paramètres. Donc
--    tout appel qui omet `p_equipements` satisfait les deux, et PostgreSQL ne
--    peut pas trancher. Reproduit ici avant d'écrire cette migration, avec les
--    sept arguments nommés de la version 0008 :
--
--        ERROR: 42725: function public.chercher_pages(p_lieu => unknown, ...,
--        p_limite => integer) is not unique
--        HINT: Could not choose a best candidate function.
--
--    Côté site, PostgREST traduit ce 42725 en **300 / PGRST203** — exactement
--    l'écran blanc qu'avait provoqué `revendiquer_page` en 0078, réparé en
--    0078b. Et la trace existe : `pg_stat_statements` garde un appel PostgREST
--    à `chercher_pages` ne portant que `p_lieu` et `p_limite`. Deux arguments,
--    donc deux candidates : cet appel-là ne pouvait que rendre 300.
--
-- ⚠ POURQUOI LA RECHERCHE DU SITE MARCHAIT QUAND MÊME. `src/lib/etablissements.ts`
--   envoie TOUJOURS les huit clés, `p_equipements` comprise même à `null` — les
--   22 appels enregistrés le confirment, tous à huit arguments nommés. Seule la
--   présence de cette clé désignait la bonne fonction. La protection tenait donc
--   à une ligne de TypeScript, pas au schéma : le type généré déclare les huit
--   arguments OPTIONNELS (`p_equipements?`), si bien qu'un futur appel sans
--   équipements compilerait sans une plainte et tomberait en 300 en production.
--   C'est le schéma qui doit interdire l'ambiguïté, pas la discipline d'appel.
--
-- ⚠ PREUVE QUE LA VERSION À 7 ARGUMENTS N'EST APPELÉE PAR PERSONNE — faite
--   avant la suppression, jamais après :
--     · dans la base : `prosrc` de TOUTES les routines de tous les schémas,
--       définitions des vues et vues matérialisées, règles, politiques RLS,
--       contraintes CHECK, expressions par défaut, index, et `pg_depend` sur son
--       OID — zéro ligne. Aucune extension d'ordonnancement (pas de `pg_cron`),
--       donc aucune tâche planifiée ne peut l'appeler ;
--     · dans le dépôt : `chercher_pages` n'apparaît que dans `src/lib/etablissements.ts`
--       (appel à huit clés), dans le type généré `src/integrations/supabase/types.ts`
--       (huit arguments), et dans les migrations 0008/0014/0018/0030. Rien sous
--       `public/`, rien dans `index.html` ;
--     · dans les fonctions déployées : le code réellement en ligne d'`agent-diako`
--       et de `send-push` a été relu — l'agent cherche par `agent_chercher`, pas
--       par `chercher_pages`.
--   Aucun appelant ne perd donc quoi que ce soit ici.
--
-- ⚠ RIEN À RÉVOQUER APRÈS COUP. La 7 arguments portait `execute` pour `anon`,
--   `authenticated`, `postgres` et `service_role` : `drop function` emporte
--   l'objet ET ses droits. La règle des trois révocations de 0071 ne s'applique
--   pas — cette migration ne crée aucune fonction, elle en retire une. La
--   survivante garde ses droits de 0030, intacts, et le contrôle final le vérifie
--   plutôt que de le supposer.
--
-- ⚠ L'IDENTITÉ EST ÉCRITE EN ENTIER, TYPE PAR TYPE. `drop function
--   public.chercher_pages` sans parenthèses échoue quand plusieurs versions
--   coexistent — c'est justement le cas ici. Et une identité approximative
--   (`int` pour `smallint`, `text` pour `text[]`) ne désigne aucune fonction :
--   avec `if exists`, elle ne supprimerait RIEN en silence, et la migration
--   passerait au vert sans avoir rien fait. Les types ci-dessous sont ceux
--   rendus par `pg_get_function_identity_arguments` sur cette base.
-- ============================================================================

drop function if exists public.chercher_pages(
  text,      -- p_lieu
  text,      -- p_categorie
  bigint,    -- p_prix_max
  text,      -- p_plat
  smallint,  -- p_curseur_score
  uuid,      -- p_curseur_id
  integer    -- p_limite
);

-- ── Contrôle 1 : il ne reste QU'UNE `chercher_pages`, et c'est la bonne ──────
-- ⚠ On compte AVANT de nommer : deux versions qui subsistent doivent lever, même
--   si celle qu'on attend est bien là. C'est l'ambiguïté qui casse le site, pas
--   l'absence d'une signature précise.
do $$
declare
  v_n      integer;
  v_restes text;
begin
  select count(*), string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by p.pronargs)
    into v_n, v_restes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'chercher_pages';

  if v_n <> 1 then
    raise exception
      'il reste % versions de chercher_pages (%) — tant qu''elles sont deux, '
      'tout appel sans p_equipements rend 42725 en base et 300/PGRST203 au site',
      v_n, coalesce(v_restes, 'aucune');
  end if;

  if to_regprocedure(
       'public.chercher_pages(text,text,bigint,text,smallint,uuid,integer,text[])'
     ) is null then
    raise exception
      'la survivante n''est pas celle attendue (%) — la recherche du site perdrait '
      'p_equipements, lat, lng et precision_geo', v_restes;
  end if;
end $$;

-- ── Contrôle 2 : la recherche répond encore, et sans les équipements ─────────
-- ⚠ C'est l'appel qui levait 42725 il y a trois lignes : sept arguments nommés,
--   sans `p_equipements`. Il doit désormais se résoudre sans hésitation. Un
--   contrôle qui se contente de compter les lignes de `pg_proc` ne prouve pas
--   que l'ambiguïté est levée — celui-ci, oui.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.chercher_pages(
    p_lieu          => null,
    p_categorie     => null,
    p_prix_max      => null,
    p_plat          => null,
    p_curseur_score => null,
    p_curseur_id    => null,
    p_limite        => 1);
exception
  when others then
    raise exception
      'un appel à sept arguments échoue encore (% / %) — la surcharge n''est pas levée',
      sqlstate, sqlerrm;
end $$;

-- ── Contrôle 3 : le site public n'a rien perdu au passage ───────────────────
-- ⚠ La suppression emporte les droits de la fonction supprimée ; elle ne doit
--   RIEN changer à ceux de la survivante. Si `anon` avait perdu `execute`, la
--   page de recherche rendrait 42501 pour tout visiteur non connecté — et on
--   l'apprendrait en production, pas ici.
do $$
declare
  v_f constant text :=
    'public.chercher_pages(text,text,bigint,text,smallint,uuid,integer,text[])';
begin
  if not has_function_privilege('anon', v_f, 'execute')
     or not has_function_privilege('authenticated', v_f, 'execute') then
    raise exception
      'chercher_pages a perdu execute pour anon ou authenticated — la recherche '
      'du site rendrait 42501';
  end if;

  -- ⚠ Et dans l'autre sens : le pseudo-rôle `public` ne doit toujours PAS l'avoir.
  --   `revoke ... from public` et `revoke ... from anon` sont deux droits
  --   distincts sur le même objet (0071, 0083) ; on vérifie les deux.
  if has_function_privilege('public', v_f, 'execute') then
    raise exception 'le pseudo-rôle public a recouvré execute sur chercher_pages';
  end if;
end $$;
