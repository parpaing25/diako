-- ============================================================================
-- 0078b — DEUX `revendiquer_page` COEXISTAIENT, ET POSTGREST NE SAVAIT PLUS
--
-- 🔴 Vérifié en production : appeler `revendiquer_page` avec trois arguments
--    rendait **300** — PGRST203, « fonction ambiguë ». En ajoutant des
--    paramètres avec valeur par défaut en 0078, j'ai créé une SURCHARGE : la
--    version à 3 arguments de 0070 vivait toujours à côté de celle à 8.
--
--    Conséquence : le bouton de revendication de l'écran actuel, qui passe
--    trois arguments, ne fonctionnait plus du tout. Une migration qui ajoute
--    une fonctionnalité et casse l'existante au passage.
--
-- ⚠ `create or replace` NE REMPLACE QUE LA MÊME SIGNATURE. Changer la liste des
--   paramètres crée une fonction NOUVELLE et laisse l'ancienne en place. Il
--   faut la supprimer nommément, avec sa signature exacte.
-- ============================================================================

drop function if exists public.revendiquer_page(uuid, text, text);

do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'revendiquer_page';
  if v_n <> 1 then
    raise exception 'il reste % versions de revendiquer_page', v_n;
  end if;
end $$;;
