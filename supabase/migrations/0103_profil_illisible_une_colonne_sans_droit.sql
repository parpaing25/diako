-- ============================================================================
-- 0103 — LE PROFIL NE SE CHARGEAIT PLUS DU TOUT, À CAUSE D'UNE SEULE COLONNE
--
-- 🔴 LE SYMPTÔME ÉTAIT MINUSCULE, LA CAUSE NE L'EST PAS. Le propriétaire l'a
--    signalé ainsi : « la photo icône compte ne change pas en photo de
--    profil ». L'avatar existe pourtant en base et le fichier répond bien en
--    `image/png` sur o2switch. Ce n'était pas l'image : c'était le PROFIL
--    ENTIER qui ne se chargeait plus.
--
--    `UserDataContext` demande quinze colonnes nommées (jamais `select('*')`,
--    règle du dépôt). L'une d'elles, `metier_pro`, ajoutée après coup, n'avait
--    de droit de lecture NI pour `anon` NI pour `authenticated`. Or `profiles`
--    est en grants PAR COLONNE : une colonne neuve n'hérite de rien. Et
--    PostgreSQL ne rend pas la ligne amputée de la colonne interdite — il
--    refuse LA REQUÊTE. Les quatorze autres colonnes, parfaitement lisibles,
--    partaient avec elle.
--
--    Conséquence réelle : `profile` valait `null` pour TOUT membre connecté.
--    Pas seulement l'avatar — le nom affiché, le type de compte, le métier, la
--    ville. Et `needsOnboarding` se calcule sur `!profile?.display_name` : un
--    membre parfaitement inscrit était traité comme s'il n'avait pas de nom.
--
-- ⚠ C'EST LE PIÈGE 0082, SUR UNE AUTRE TABLE. Il avait été payé sur `places`,
--   documenté, puis vérifié explicitement en 0096 (`dishes`) et en 0098
--   (`pages`). Personne n'avait rejoué le contrôle sur `profiles`.
--
-- ⚠ POURQUOI `metier_pro` PEUT ÊTRE LU PAR TOUT LE MONDE. C'est le métier
--   affiché sur une fiche professionnelle publique — au même titre que
--   `account_type` et `lieux_publics`, déjà lisibles par `anon`. Ce n'est pas
--   une donnée personnelle fermée par 0001 : ni e-mail, ni téléphone, ni pièce
--   d'identité, dont les droits ne bougent pas d'un iota ici.
-- ============================================================================

grant select (metier_pro) on public.profiles to anon, authenticated;

-- ============================================================================
-- CONTRÔLE — on ne vérifie pas `metier_pro`, on vérifie LA LISTE ENTIÈRE.
--
-- ⚠ Corriger la seule colonne coupable laisserait le défaut se reproduire à la
--   prochaine colonne ajoutée. L'assertion recopie donc la liste exacte que
--   `PROFILE_COLUMNS` demande dans `src/contexts/UserDataContext.tsx` : si l'un
--   des deux côtés bouge sans l'autre, c'est ICI que ça casse — au moment où
--   c'est réparable — et non chez un visiteur dont le profil reste vide sans
--   qu'aucune erreur ne s'affiche à l'écran.
-- ============================================================================
do $$
declare
  v_manquantes text;
  v_inconnues  text;
  v_colonnes constant text[] := string_to_array(
    'id,display_name,avatar_url,cover_url,bio,home_place,language,account_type,'
    || 'verification,followers_count,following_count,posts_count,created_at,'
    || 'metier_pro,lieux_publics', ',');
begin
  -- ① Une colonne que le client demande et qui n'existe plus casserait la
  --    requête tout autant qu'un droit manquant.
  select string_agg(c, ', ') into v_inconnues
    from unnest(v_colonnes) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = c);
  if v_inconnues is not null then
    raise exception '0103 : PROFILE_COLUMNS demande des colonnes absentes de profiles : %', v_inconnues;
  end if;

  -- ② Le droit de lecture, pour les deux rôles clients.
  select string_agg(c || ' (' || r || ')', ', ') into v_manquantes
    from unnest(v_colonnes) c
    cross join unnest(array['anon', 'authenticated']) r
   where not has_column_privilege(r, 'public.profiles', c, 'select');
  if v_manquantes is not null then
    raise exception '0103 : ces colonnes de profiles sont illisibles, donc TOUT le select échoue : %', v_manquantes;
  end if;

  -- ③ Ce qui doit rester fermé le reste. Une correction de droits qui ouvrirait
  --    l'e-mail au passage serait bien pire que le défaut qu'elle répare.
  if has_column_privilege('anon', 'public.profiles', 'email', 'select') then
    raise exception '0103 : l''e-mail des membres est devenu lisible anonymement';
  end if;
end $$;
