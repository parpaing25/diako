-- ============================================================================
-- 0084 — LES JUSTIFICATIFS ÉTAIENT EXIGÉS PAR L'ÉCRAN, PAS PAR LA BASE
--
-- 🔴 VÉRIFIÉ : toute l'exigence vivait dans le navigateur. `Revendication.tsx`
--    grise son bouton tant qu'il manque le couple NIF+STAT ou une pièce — mais
--    la fonction, elle, acceptait tout. Cet appel-là passait :
--
--      rpc('revendiquer_page', { p_page: …, p_message: null, p_tel: null,
--                                p_nif: null, p_stat: null, p_piece: null,
--                                p_photo_lieu: null, p_role: null })
--
--    Un dossier vide entrait donc dans la file d'attente, indiscernable d'un
--    vrai. Et comme accepter une revendication donne la fiche ET les messages
--    des clients, la seule barrière restante était l'attention de l'humain qui
--    relit — sur une file où les dossiers vides sont gratuits à produire.
--
--    Même cause pour la photo : l'écran l'annonce « facultatif » et elle ne
--    figurait dans AUCUNE condition, ni ici ni là-bas. La consigne du
--    propriétaire est pourtant explicite : « il faut une photo réelle du lieu,
--    NIF, STAT ou carte prouvant la propriété ». On la met où elle tient.
--
-- ⚠ ON NE DOUBLE PAS LA RÈGLE PAR UNE CONTRAINTE DE TABLE, pour deux raisons.
--   D'abord 0070 a déjà retiré `insert/update/delete` sur `page_claims` à
--   `authenticated` et `anon` : cette fonction est le SEUL chemin d'écriture,
--   une contrainte n'attraperait rien de plus. Ensuite un `check` refuse avec
--   « new row violates check constraint "page_claims_…" » — ce texte remonte
--   tel quel dans la notification à l'écran, et ne dit pas ce qui manque.
--   Ici chaque refus nomme la pièce absente, en français, à l'utilisateur.
--
-- ⚠ LES MESSAGES SONT ACCENTUÉS, contrairement à ceux de 0078. Ce ne sont pas
--   des journaux d'administration : ils sont rendus tels quels dans le toast de
--   `Revendication.tsx`. « un numero de telephone ou nous pouvons vous
--   joindre » disait littéralement l'inverse de « OÙ nous pouvons vous
--   joindre » — un accent manquant est ici une faute de sens, pas de style.
--
-- ⚠ LA SIGNATURE ET LE TYPE DE RETOUR NE BOUGENT PAS : mêmes huit paramètres
--   dans le même ordre, toujours `returns uuid`. `create or replace` suffit
--   donc, sans 42P13 et — surtout — sans créer une SURCHARGE. C'est très
--   exactement l'accident de 0078, réparé en 0078b : deux versions de
--   `revendiquer_page` avaient coexisté et PostgREST rendait 300 (PGRST203),
--   ce qui avait cassé le bouton pour tout le monde. L'assertion en fin de
--   fichier vérifie qu'il n'en reste qu'une.
--
-- ⚠ CE QUE CE FICHIER PROUVE, ET COMMENT. Un contrôle final qui vérifie que
--   `anon` n'a pas `execute` et qu'il n'existe qu'une version de la fonction
--   ne prouve RIEN de 0084 : ces deux propriétés étaient déjà vraies avant.
--   Ce sont des garde-fous de non-régression, utiles mais muets sur le verrou.
--   Le contrôle 2 lit le corps déployé et exige que chacun des huit verrous
--   y soit ; le contrôle 3 appelle la fonction sans session et exige un refus.
--   Ni l'un ni l'autre n'écrit quoi que ce soit — voir le contrôle 2 pour
--   pourquoi on refuse de fabriquer un compte pour se tester soi-même.
-- ============================================================================

create or replace function public.revendiquer_page(
  p_page uuid, p_message text, p_tel text,
  p_nif text default null, p_stat text default null,
  p_piece text default null, p_photo_lieu text default null,
  p_role text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi   uuid := (select auth.uid());
  v_prop  uuid;
  v_existe boolean;
  v_type  text;
  v_id    uuid;
  v_deja  text;
  v_tel   text;
  v_nif   text;
  v_stat  text;
  v_piece text;
  v_photo text;
  v_mime  text;
  v_fiscal boolean;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;

  -- ⚠ LE TYPE DE COMPTE SE LIT EN BASE, jamais sur la parole de l'appelant :
  --   aucun paramètre ne le porte, et l'écran qui masque le bouton aux
  --   voyageurs n'empêche pas un appel direct à l'API.
  select account_type into v_type from public.profiles where id = v_moi;
  if v_type is distinct from 'pro' then
    raise exception 'Seuls les comptes professionnels peuvent revendiquer un établissement. Passez votre compte en professionnel depuis votre profil, puis recommencez.';
  end if;

  select owner_id, true into v_prop, v_existe from public.pages where id = p_page;
  if v_existe is null then raise exception 'Cet établissement n''existe pas.'; end if;
  if v_prop is not null then
    raise exception 'Cette fiche a déjà un propriétaire. Écrivez-nous si c''est une erreur.';
  end if;

  -- ⚠ LA SORTIE ANTICIPÉE DE 0078 RESTE EN PREMIER, AVANT LES CONTRÔLES : elle
  --   rend le dossier déjà déposé sans y toucher, pour ne pas punir quelqu'un
  --   qui re-clique après trois jours sans réponse — c'est ce que 0078 avait
  --   corrigé, et le re-vérifier ici écraserait sa demande.
  --
  -- 🔴 CE QU'ELLE LAISSE PASSER, ET QU'IL FAUT DIRE. Les contrôles ci-dessous
  --    ne s'appliquent qu'aux dossiers déposés À PARTIR de 0084. Une demande
  --    créée entre 0078 et 0084 n'en a passé AUCUN, et ce raccourci lui évite
  --    de les rencontrer un jour : elle restera en file telle quelle. Écrire
  --    « un dossier en attente a forcément passé ces mêmes contrôles » serait
  --    donc faux — c'est vrai demain, pas hier. Pour cette base la fenêtre est
  --    vide (`page_claims` : 0 ligne au moment d'écrire, aucune revendication
  --    n'a jamais été déposée), mais c'est un constat daté, pas une garantie :
  --    d'ici l'application, la relecture humaine reste le seul filet pour les
  --    dossiers de cette fenêtre.
  select statut into v_deja from public.page_claims
   where page_id = p_page and user_id = v_moi;
  if v_deja = 'en_attente' then
    select id into v_id from public.page_claims
     where page_id = p_page and user_id = v_moi;
    return v_id;
  end if;

  v_tel   := nullif(btrim(coalesce(p_tel,        '')), '');
  v_nif   := nullif(btrim(coalesce(p_nif,        '')), '');
  v_stat  := nullif(btrim(coalesce(p_stat,       '')), '');
  v_piece := nullif(btrim(coalesce(p_piece,      '')), '');
  v_photo := nullif(btrim(coalesce(p_photo_lieu, '')), '');

  -- ── Un téléphone joignable ────────────────────────────────────────────────
  --
  -- ⚠ ON COMPTE LES CHIFFRES, ON N'IMPOSE PAS UN FORMAT MALGACHE. Le dossier se
  --   vérifie en rappelant la personne : un numéro absent rend la file
  --   ininstruisible. Mais exiger `03X XX XXX XX` rejetterait le gérant joignable
  --   sur un numéro étranger, qui existe. Neuf chiffres écartent la saisie
  --   bâclée sans écarter personne de légitime.
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 9 then
    raise exception 'Indiquez un numéro de téléphone où nous pouvons vous joindre : c''est par là que nous vérifions le dossier.';
  end if;

  -- ── La photo du lieu, désormais obligatoire ───────────────────────────────
  --
  -- ⚠ QUATRE CHOSES SE VÉRIFIENT ICI, DANS CET ORDRE, ET CHACUNE A SON MESSAGE.
  --   Les fondre en une seule condition rendrait un refus unique — « joignez
  --   une photo » — à quelqu'un qui vient précisément d'en joindre une. Le
  --   refus doit nommer ce qui cloche, sinon il fait abandonner.
  --
  -- ⚠ LE CHEMIN DIT À QUOI LE FICHIER SERT, ET À QUI IL EST. `televerserPiece`
  --   (src/lib/justificatifs.ts) construit exactement
  --   `${user.id}/${quoi}-${crypto.randomUUID()}.${ext}` avec
  --   `quoi ∈ {piece, photo_lieu}` : le premier segment est le compte — c'est
  --   le préfixe que compare la policy `justif_depose` de 0078 —, et le début
  --   du nom de fichier est la case du formulaire d'où il vient. Exiger
  --   `<mon compte>/photo_lieu-…` ferme donc deux choses d'un coup : bâtir son
  --   dossier sur la pièce déposée par un tiers, et faire tenir les deux rôles
  --   au même fichier (un objet porte un nom, donc un seul rôle — la photo et
  --   la pièce ne peuvent structurellement plus être le même fichier).
  --   ⚠ C'est un couplage assumé avec le nom construit côté écran : changer
  --     cette convention dans `justificatifs.ts` sans la changer ici refuserait
  --     tous les dossiers.
  if v_photo is null then
    raise exception 'Joignez une photo du lieu prise sur place : c''est elle qui montre que vous y êtes.';
  end if;

  if not starts_with(v_photo, v_moi::text || '/photo_lieu-') then
    raise exception 'Ce fichier n''a pas été déposé comme photo du lieu. Reprenez l''envoi depuis la case « Une photo du lieu » : c''est ce qui distingue la photo de la pièce justificative.';
  end if;

  -- 🔴 LA « PHOTO DU LIEU » POUVAIT ÊTRE UN PDF, ET RIEN NE L'ARRÊTAIT ICI. Le
  --    seau `justificatifs` accepte `application/pdf` (0078, `allowed_mime_types`)
  --    parce qu'une attestation NIF scannée en est un. Un contrôle qui ne
  --    regardait que la présence du chemin laissait donc entrer un dossier sans
  --    la seule preuve qu'on ne peut pas produire à distance. L'extension est
  --    imposée ICI et seulement ici : en pièce justificative, le PDF reste
  --    parfaitement légitime.
  -- ⚠ L'ÉCRAN FILTRE DÉJÀ CETTE CASE — `TYPES_OK.photo_lieu` ne contient pas le
  --   PDF, et l'attribut `accept` du sélecteur non plus. Ce n'est pas une raison
  --   de s'en passer en base : le filtre du navigateur épargne un aller-retour
  --   en 3G, il n'oppose rien à un appel direct de la fonction. Les deux règles
  --   servent deux publics différents et doivent rester alignées — si la liste
  --   de `justificatifs.ts` change, celle-ci doit changer avec.
  if v_photo !~* '\.(jpe?g|png|webp)$' then
    raise exception 'La photo du lieu doit être une image (JPG, PNG ou WEBP) : un PDF ne montre pas que vous êtes sur place. Gardez le PDF pour la pièce justificative, et photographiez la façade ou l''enseigne.';
  end if;

  -- ⚠ ON VÉRIFIE QUE LE FICHIER EXISTE VRAIMENT, pas seulement que la chaîne est
  --   non vide : le chemin vient de l'appelant, et `p_photo_lieu: 'photo.jpg'`
  --   satisferait n'importe quel test de présence sans qu'aucune photo n'ait
  --   jamais été déposée.
  select o.metadata ->> 'mimetype' into v_mime
    from storage.objects o
   where o.bucket_id = 'justificatifs' and o.name = v_photo;

  if not found then
    raise exception 'Votre photo du lieu n''est pas arrivée jusqu''à nous — renvoyez-la. Si vous venez de l''envoyer, l''envoi n''a pas abouti.';
  end if;

  -- ⚠ LE TYPE ENREGISTRÉ AU DÉPÔT, EN PLUS DE L'EXTENSION — et on sait ce que
  --   ça vaut : c'est le `Content-Type` annoncé par le client, que le seau
  --   restreint aux quatre types de 0078. Personne n'ouvre le fichier côté
  --   serveur. Ça rattrape un PDF renommé `.jpg`, pas un PDF envoyé sous une
  --   étiquette d'image. On tolère l'absence de métadonnée plutôt que de
  --   refuser un dépôt légitime dont le type ne serait pas renseigné.
  if v_mime is not null and v_mime not like 'image/%' then
    raise exception 'Le fichier envoyé comme photo du lieu n''est pas une image (%). Prenez l''établissement en photo : c''est cette photo-là qui montre que vous y êtes.', v_mime;
  end if;

  -- ── Le couple fiscal OU une pièce justificative ───────────────────────────
  --
  -- ⚠ LES SEUILS SONT CEUX DE L'ÉCRAN, NI PLUS NI MOINS (`formeNif` : 8
  --   chiffres, `formeStat` : 10 caractères). Se contenter de « non vide »
  --   laisserait passer un NIF à un chiffre, ce qui revient au dossier vide
  --   qu'on ferme ici. Aller plus loin refuserait des dossiers que le
  --   formulaire annonce pourtant comme complets.
  --
  -- ⚠ CE CONTRÔLE RESTE UN CONTRÔLE DE FORME. Recopier son NIF dans la case
  --   STAT le passe : c'est pour cela qu'aucun badge ne se déduit d'ici, un
  --   humain regarde les pièces. Le verrou écarte les dossiers vides, il ne
  --   prononce pas une vérification.
  v_fiscal := v_nif is not null
          and v_stat is not null
          and length(regexp_replace(v_nif,  '\D', '', 'g')) >= 8
          and length(regexp_replace(v_stat, '[^0-9A-Za-z]', '', 'g')) >= 10;

  if not v_fiscal and v_piece is null then
    raise exception 'Il nous faut soit votre NIF ET votre STAT, soit une pièce à votre nom mentionnant l''établissement (carte statistique, attestation NIF, patente).';
  end if;

  -- 🔴 CES DEUX CONTRÔLES ÉTAIENT ENFERMÉS DANS `if not v_fiscal`, ET C'ÉTAIT UN
  --    TROU. Dès que le couple fiscal était bien formé — huit chiffres et dix
  --    caractères suffisent, c'est un contrôle de FORME — `p_piece` entrait en
  --    base sans être regardé une seule fois. Un appel direct pouvait donc y
  --    ranger le chemin du fichier de QUELQU'UN D'AUTRE : le dossier serait
  --    passé en revue avec, attaché à son nom, une pièce qu'il n'a jamais
  --    déposée. La règle « soit l'un, soit l'autre » dit ce qu'on EXIGE ; elle
  --    n'a jamais voulu dire qu'un fichier fourni en plus échappe à tout.
  --
  -- ⚠ AUCUNE CONTRAINTE D'EXTENSION ICI, contrairement à la photo du lieu : une
  --   attestation NIF scannée en PDF est exactement ce qu'on demande.
  if v_piece is not null then
    if not starts_with(v_piece, v_moi::text || '/piece-') then
      raise exception 'Ce fichier n''a pas été déposé comme pièce justificative. Reprenez l''envoi depuis la case « Un document à votre nom ».';
    end if;

    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'justificatifs' and o.name = v_piece
    ) then
      raise exception 'Votre pièce justificative n''est pas arrivée jusqu''à nous — renvoyez-la, ou renseignez plutôt votre NIF et votre STAT.';
    end if;
  end if;

  -- ⚠ LE RÔLE DÉCLARÉ SE VÉRIFIE ICI, pas dans la contrainte de table.
  --   `page_claims_role_check` n'admet que ces quatre valeurs ; sans ce test, un
  --   appel direct avec « patron » fait remonter dans la notification de l'écran
  --   le texte brut d'une violation de contrainte PostgreSQL — illisible pour
  --   tout le monde, et d'abord pour la personne visée.
  if p_role is not null and btrim(p_role) <> ''
     and btrim(p_role) not in ('proprietaire', 'gerant', 'employe_mandate', 'autre') then
    raise exception 'Ce rôle n''existe pas. Indiquez si vous êtes propriétaire, gérant, employé mandaté, ou autre.';
  end if;

  insert into public.page_claims
    (page_id, user_id, message, telephone, nif, stat,
     piece_chemin, photo_lieu_chemin, role_declare)
  values
    (p_page, v_moi,
     nullif(btrim(coalesce(p_message,'')), ''),
     v_tel, v_nif, v_stat, v_piece, v_photo,
     nullif(btrim(coalesce(p_role,'')), ''))
  on conflict (page_id, user_id) do update
    set message = excluded.message, telephone = excluded.telephone,
        nif = excluded.nif, stat = excluded.stat,
        piece_chemin = excluded.piece_chemin,
        photo_lieu_chemin = excluded.photo_lieu_chemin,
        role_declare = excluded.role_declare,
        statut = 'en_attente', created_at = now(),
        -- ⚠ Un nouveau dossier annule une purge programmée : sans ça, les
        --   pièces fraîches seraient effacées par le ménage de l'ancien.
        pieces_purgees_le = null
  returning id into v_id;
  return v_id;
end $$;

-- ── Les trois révocations, et la preuve qu'elles ont pris ───────────────────
--
-- ⚠ `create or replace` conserve les droits existants : ces lignes ne sont pas
--   redondantes, elles sont la garantie qu'on ne repart pas d'un état supposé.
--   Et `revoke ... from public` NE retire PAS le droit qu'`ALTER DEFAULT
--   PRIVILEGES` a accordé à `anon` DIRECTEMENT — il faut le nommer.
revoke all on function public.revendiquer_page(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.revendiquer_page(uuid, text, text, text, text, text, text, text)
  to authenticated;

-- ── Contrôle 1 : les garde-fous de non-régression ───────────────────────────
--
-- ⚠ CES DEUX ASSERTIONS NE PROUVENT RIEN DE 0084, et il faut le savoir : `anon`
--   était déjà sans `execute` (0071), et il n'existait déjà qu'une version de
--   la fonction (0078b). Elles restent parce qu'elles attrapent une régression
--   future — une surcharge accidentelle rend PostgREST 300 (PGRST203) et casse
--   le bouton pour tout le monde. Le verrou, lui, se prouve au contrôle 2.
do $$
declare v_n integer;
begin
  if has_function_privilege('anon',
       'public.revendiquer_page(uuid,text,text,text,text,text,text,text)', 'execute') then
    raise exception 'anon garde execute sur revendiquer_page';
  end if;

  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'revendiquer_page';
  if v_n <> 1 then
    raise exception 'il reste % versions de revendiquer_page', v_n;
  end if;
end $$;

-- ── Contrôle 2 : les huit verrous sont bien DANS la fonction ────────────────
--
-- 🔴 UNE MIGRATION DE SÉCURITÉ QUI NE PROUVE PAS SON EFFET N'A PAS EU LIEU. Le
--    contrôle 1 ci-dessus n'y suffit pas : ses deux assertions étaient déjà
--    vraies AVANT 0084, elles ne disent donc rien de ce que 0084 ajoute.
--
-- ⚠ POURQUOI ON N'APPELLE PAS LA FONCTION. La version précédente de ce bloc
--   fabriquait un compte — `insert into auth.users` plus un profil « pro » —
--   pour se donner la session professionnelle sans laquelle les contrôles sont
--   inatteignables, puis se reposait sur l'annulation d'une sous-transaction
--   pour l'effacer. Le raisonnement SQL est juste, et il ne suffit pas : sur
--   Supabase, une écriture dans `auth.users` réveille des déclencheurs et peut
--   partir en Auth Hook ou en webhook. UNE ANNULATION DE TRANSACTION NE RAPPELLE
--   PAS UN APPEL RÉSEAU DÉJÀ PARTI. On refuse d'écrire dans la table des
--   comptes pour se tester soi-même : le prix d'un échec est trop haut, et il
--   retomberait sur des vrais comptes.
--
-- ⚠ CE QUE CETTE VÉRIFICATION VAUT, EXACTEMENT. Elle lit le corps compilé de la
--   fonction et exige que chaque verrou y soit. Elle attrape le vrai risque de
--   cette migration — un déploiement partiel, un `create or replace` écrasé par
--   une version plus ancienne, une reprise qui perd un `if` — et elle n'attrape
--   PAS une erreur de logique dans un verrou présent. C'est écrit ici pour que
--   personne ne lui prête davantage.
do $$
declare
  v_src   text;
  v_verrou text;
  v_manque text[] := '{}';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'revendiquer_page';

  if v_src is null then
    raise exception '0084 : revendiquer_page est introuvable après la migration.';
  end if;

  foreach v_verrou in array array[
    'account_type',                       -- seul un compte professionnel entre
    'numéro de téléphone',                -- un téléphone joignable
    'photo_lieu-',                        -- la photo est déposée dans SA case
    'jpe?g|png|webp',                     -- et c'est une image, pas un PDF
    'image/',                             -- son type déposé est bien une image
    'piece-',                             -- la pièce aussi est dans sa case
    'storage.objects',                    -- les deux fichiers existent vraiment
    'NIF ET votre STAT'                   -- couple fiscal, ou pièce
  ] loop
    if position(v_verrou in v_src) = 0 then
      v_manque := v_manque || v_verrou;
    end if;
  end loop;

  if array_length(v_manque, 1) is not null then
    raise exception '0084 : verrous absents du corps déployé : %. La fonction en base n''est pas celle de cette migration.',
      array_to_string(v_manque, ', ');
  end if;
end $$;

-- ── Contrôle 3 : sans session, la fonction refuse ───────────────────────────
--
-- ⚠ Le seul appel réel qu'on s'autorise : il n'écrit rien, ne suppose aucun
--   compte, et prouve que la fonction est appelable et qu'elle refuse par
--   défaut. Si elle ACCEPTAIT sans session, tout le reste serait sans objet.
do $$
declare v_page uuid; v_accepte boolean := false;
begin
  select id into v_page from public.pages order by id limit 1;
  if v_page is null then
    raise warning '0084 : aucune fiche en base, contrôle 3 non joué.';
    return;
  end if;
  begin
    perform public.revendiquer_page(v_page, null, null, null, null, null, null, null);
    v_accepte := true;
  exception when others then
    null;  -- refus attendu : c'est le résultat recherché
  end;
  if v_accepte then
    raise exception '0084 : la fonction a ACCEPTÉ un dossier vide sans session.';
  end if;
end $$;
