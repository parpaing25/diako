-- ============================================================================
-- 0083 — LES RÉVOCATIONS OUBLIÉES, ET CELLE QU'IL NE FAUT SURTOUT PAS FAIRE
--
-- Recensement complet : 46 fonctions de `public` sont exécutables par `anon`.
-- Cinq d'entre elles le sont par erreur — ce sont des fonctions de déclencheur,
-- qui ÉCRIVENT (compteurs de pages, de récits, prix minimum, plafond d'offres,
-- date d'expiration d'un projet de voyage). Elles n'ont jamais été passées à la
-- règle des trois révocations de 0071. On les ferme ici.
--
-- ⚠ ELLES SONT AUSSI ACCORDÉES À `public`, ce que les fonctions d'appel du site
--   ne sont pas. Deux droits distincts sur le même objet : révoquer l'un laisse
--   l'autre. D'où `from public, anon` — les deux nommément, comme en 0071.
--
-- ⚠ POURQUOI RÉVOQUER `anon` NE CASSE AUCUN DÉCLENCHEUR. PostgreSQL vérifie le
--   droit d'exécution d'une fonction de déclencheur au moment du CREATE TRIGGER,
--   pas à chaque déclenchement. Et par prudence on garde `authenticated` : les
--   six déclencheurs concernés (pages, posts, menu_items, room_types,
--   trip_requests, trip_offers) ne sont jamais déclenchés par un anonyme — aucune
--   politique RLS ne laisse `anon` écrire dans ces tables. Sous les deux
--   hypothèses, le rôle qui écrit garde le droit. La révocation est sans effet
--   de bord.
--
-- 🔴 CE QUE L'AUDIT SE TROMPAIT DE VOULOIR RÉVOQUER : `page_a_moi(uuid)`.
--    Elle est bien exécutable par `anon`, et ça ressemble à un oracle de
--    propriété — mais la révoquer METTRAIT LE SITE PUBLIC À GENOUX. Elle est
--    citée dans 14 politiques `*_lecture` en SELECT, accordées au rôle `public`
--    donc évaluées pour un visiteur anonyme : chambres, carte du restaurant,
--    photos et sections de carte, équipements, cuisines, horaires, activités,
--    circuits, jours/inclusions/tarifs de circuit, tarifs saisonniers, réponses
--    aux avis. Toute la fiche d'un établissement, vue sans compte.
--
--    On aurait pu croire le `OR` protecteur — `page_publiee(x) OR page_a_moi(x)`,
--    la partie gauche est vraie pour une fiche publiée, la droite ne serait
--    jamais atteinte. C'EST FAUX, et c'est le piège. PostgreSQL vérifie le droit
--    d'exécution à l'initialisation du plan, sur tout l'arbre d'expression, AVANT
--    la première ligne : un `OR` ne court-circuite pas une vérification de droit.
--    Vérifié sur cette base même, rôle `anon`, sur une requête dont toutes les
--    lignes satisfaisaient la partie gauche — elle a quand même levé 42501. Une
--    révocation ici, et chaque fiche d'hôtel rend « permission denied » au lieu
--    de ses chambres.
--
--    Et l'oracle n'existe pas : `page_a_moi` compare à `auth.uid()`, qui est nul
--    sans session. Appelée par un anonyme elle rend `false` pour TOUTE page —
--    vérifié. Elle ne révèle donc rien à qui n'a pas de compte. Elle reste.
--
-- ⚠ MÊME RAISON POUR `page_publiee`, `page_de_la_chambre`, `page_du_circuit`,
--   `profil_expose`, `is_admin`, `is_staff` : toutes citées dans des politiques
--   évaluées pour `anon`. Les révoquer coupe la lecture anonyme. Le bloc de
--   contrôle final les vérifie DANS L'AUTRE SENS — il lève si l'une d'elles a
--   perdu le droit. Une migration de sécurité doit prouver ce qu'elle ferme,
--   mais aussi ce qu'elle a promis de laisser ouvert.
-- ============================================================================

revoke all on function public.maj_nb_pages()        from public, anon;
revoke all on function public.maj_nb_posts()        from public, anon;
revoke all on function public.maj_prix_minimum()    from public, anon;
revoke all on function public.trip_expire_le()      from public, anon;
revoke all on function public.trip_offers_plafond() from public, anon;

-- ⚠ Le rôle qui écrit réellement garde le droit, explicitement. Ceinture et
--   bretelles : si une version de PostgreSQL vérifiait le droit au moment du
--   déclenchement, les écritures des membres continueraient de passer.
grant execute on function public.maj_nb_pages()        to authenticated;
grant execute on function public.maj_nb_posts()        to authenticated;
grant execute on function public.maj_prix_minimum()    to authenticated;
grant execute on function public.trip_expire_le()      to authenticated;
grant execute on function public.trip_offers_plafond() to authenticated;

-- ── Contrôle 1 : plus rien d'indu ne reste chez anon ────────────────────────
do $$
declare v_reste text;
begin
  select string_agg(f, ', ' order by f) into v_reste from (
    select 'maj_nb_pages' as f
     where has_function_privilege('anon', 'public.maj_nb_pages()', 'execute')
        or has_function_privilege('public', 'public.maj_nb_pages()', 'execute')
    union all
    select 'maj_nb_posts'
     where has_function_privilege('anon', 'public.maj_nb_posts()', 'execute')
        or has_function_privilege('public', 'public.maj_nb_posts()', 'execute')
    union all
    select 'maj_prix_minimum'
     where has_function_privilege('anon', 'public.maj_prix_minimum()', 'execute')
        or has_function_privilege('public', 'public.maj_prix_minimum()', 'execute')
    union all
    select 'trip_expire_le'
     where has_function_privilege('anon', 'public.trip_expire_le()', 'execute')
        or has_function_privilege('public', 'public.trip_expire_le()', 'execute')
    union all
    select 'trip_offers_plafond'
     where has_function_privilege('anon', 'public.trip_offers_plafond()', 'execute')
        or has_function_privilege('public', 'public.trip_offers_plafond()', 'execute')
  ) s;
  if v_reste is not null then
    raise exception 'anon (ou public) garde execute sur : %', v_reste;
  end if;
end $$;

-- ── Contrôle 2 : la navigation anonyme n'est pas tombée ─────────────────────
-- ⚠ Ces sept fonctions DOIVENT rester exécutables par anon. Si une migration
--   future les révoque « pour faire propre », c'est ici que ça se verra, et pas
--   en production sur une fiche d'hôtel vide.
do $$
declare v_perdu text;
begin
  select string_agg(f, ', ' order by f) into v_perdu from (
    select f from unnest(array[
      'public.page_a_moi(uuid)',
      'public.page_publiee(uuid)',
      'public.page_de_la_chambre(uuid)',
      'public.page_du_circuit(uuid)',
      'public.profil_expose(uuid)',
      'public.is_admin()',
      'public.is_staff()'
    ]) as f
     where not has_function_privilege('anon', f, 'execute')
  ) s;
  if v_perdu is not null then
    raise exception
      'anon a PERDU execute sur : % — les politiques de lecture publique '
      'appellent ces fonctions, la fiche publique rendrait 42501', v_perdu;
  end if;
end $$;
