-- ============================================================================
-- 0098 — UN VISITEUR PROPOSE UNE PHOTO, L'ADMINISTRATION TRANCHE
--
-- 🔴 CE QUE LE PRODUIT MONTRE AUJOURD'HUI. `pages.cover_url` et `pages.gallery`
--    sont vides sur les 54 établissements ; 0082 a dû créer `places.cover_url`
--    parce que les 178 destinations n'avaient RIEN ; 0096 a posé les crédits des
--    95 plats pour une moisson qui n'a pas encore eu lieu. Le référentiel le
--    plus défendable du produit se présente sans images, et les seules
--    personnes qui en ont — celles qui reviennent de voyage — n'ont aucun
--    moyen d'en donner une.
--
-- ⚠ UNE PHOTO PROPOSÉE N'APPARAÎT NULLE PART TANT QU'ELLE N'EST PAS APPROUVÉE,
--   ET CE N'EST PAS L'INTERFACE QUI LE GARANTIT. La table est fermée à `anon`
--   (aucun grant), et surtout : l'approbation est la SEULE écriture qui recopie
--   l'URL sur la fiche visée. Tant qu'elle n'a pas eu lieu, aucune requête du
--   produit — carte, annuaire, atlas, fil — ne peut ramener cette photo, parce
--   qu'aucune de ces requêtes ne lit cette table. Il n'y a pas de « filtre
--   `statut = approuvee` » à oublier quelque part : il n'y a rien à filtrer.
--
-- ⚠ CE QUE L'APPROBATION NE PEUT PAS FAIRE, DIT FRANCHEMENT. Le fichier lui-
--   même part sur o2switch AVANT la décision, comme toute image publique de ce
--   dépôt (Supabase Storage est réservé aux pièces d'identité — bucket privé
--   `justificatifs`, facteur 17 sur l'egress ailleurs). Une photo en attente
--   est donc joignable par qui connaît son URL exacte — chemin de 8 caractères
--   aléatoires sous l'identifiant du proposeur — mais elle n'est LIÉE nulle
--   part et aucune page ne la nomme. Dire « c'est privé » serait faux ; c'est
--   NON PUBLIÉ, ce n'est pas la même chose.
--
-- 🔴 ET LE REFUS N'EFFACE PAS TOUJOURS LE FICHIER — À SAVOIR AVANT DE S'Y FIER.
--    L'écran d'administration appelle bien `deleteFromO2Switch`, mais
--    `o2delete.php` refuse tout chemin hors du dossier de l'appelant
--    (`^<dossier>/<jwtUserId>/`), un garde anti-IDOR qui ne connaît pas les
--    administrateurs. Le fichier d'un MEMBRE survit donc à son refus, à son
--    adresse, sans être lié nulle part. Fermer complètement la fenêtre demande
--    d'apprendre à `o2delete.php` à reconnaître un administrateur — hors
--    périmètre de cette migration, et noté dans docs/chantiers/admin.md.
--
-- ⚠ QUATRE CIBLES, PARCE QUE LES QUATRE ONT LA MÊME LACUNE. destination
--   (`places`), site (`attractions`), plat (`dishes`), établissement (`pages`).
--   Les trois premières portent déjà leurs trois champs de crédit (0049, 0082,
--   0096) ; `pages` ne les avait pas, on les ajoute ici — sans quoi une photo
--   approuvée s'afficherait sans nommer son auteur, ce que 0049 refuse
--   explicitement pour les autres tables.
--
-- ⚠ LE PIÈGE 0082 EST TRAITÉ SANS ÊTRE SUPPOSÉ. Sur `places`, `anon` n'avait
--   que des grants PAR COLONNE : une colonne ajoutée n'héritait de rien et la
--   lecture partait en « permission denied for table places ». On ne sait pas
--   de mémoire dans quel régime est `pages` — alors on pose le
--   `grant select (...)` explicite, inoffensif si la table a un grant global,
--   indispensable sinon, et l'assertion finale le PROUVE dans les deux cas.
-- ============================================================================

-- ── ① Les crédits manquants sur les établissements ─────────────────────────
alter table public.pages add column if not exists cover_credit  text;
alter table public.pages add column if not exists cover_licence text;
alter table public.pages add column if not exists cover_source  text;

grant select (cover_credit, cover_licence, cover_source)
  on public.pages to anon, authenticated;

-- ── ② La table des propositions ────────────────────────────────────────────
create table if not exists public.photo_propositions (
  id           uuid primary key default gen_random_uuid(),
  proposeur_id uuid not null references public.profiles(id) on delete cascade,
  cible_type   text not null check (cible_type in ('destination','site','plat','etablissement')),
  cible_id     uuid not null,

  -- ⚠ L'URL DOIT ÊTRE UNE URL o2switch. La contrainte n'est pas décorative :
  --   elle empêche qu'un jour une photo publique atterrisse dans Supabase
  --   Storage — la règle du dépôt, et un facteur 17 sur la facture d'egress.
  url          text not null check (url ~ '^https?://[^/]+/uploads/'),
  largeur      integer check (largeur is null or largeur > 0),
  hauteur      integer check (hauteur is null or hauteur > 0),
  legende      text check (legende is null or char_length(legende) <= 300),

  -- ⚠ LE CRÉDIT VOYAGE AVEC LA PHOTO, dès la proposition. Le recopier au
  --   moment de l'approbation depuis le profil marcherait — jusqu'au jour où
  --   le proposeur change son nom d'affichage entre les deux.
  credit       text,

  statut       text not null default 'en_attente'
                 check (statut in ('en_attente','approuvee','refusee')),
  motif_refus  text check (motif_refus is null or char_length(motif_refus) <= 500),
  traite_par   uuid references public.profiles(id) on delete set null,
  traite_le    timestamptz,
  created_at   timestamptz not null default now(),

  -- ⚠ LA DÉCISION DOIT PORTER SA TRACE. Une ligne « refusée » sans qui ni
  --   quand n'est pas une décision, c'est une disparition.
  constraint photo_propositions_trace check (
    statut = 'en_attente' or traite_le is not null
  ),
  constraint photo_propositions_motif check (
    statut <> 'refusee' or nullif(trim(coalesce(motif_refus, '')), '') is not null
  )
);

-- ⚠ UNE SEULE PROPOSITION EN ATTENTE PAR PERSONNE ET PAR FICHE. Sans cet
--   index, un double-clic sur un réseau 3G — le geste NORMAL quand rien ne
--   répond — dépose deux fois la même photo dans la file.
create unique index if not exists photo_propositions_une_seule_en_attente
  on public.photo_propositions (proposeur_id, cible_type, cible_id)
  where statut = 'en_attente';

-- ⚠ INDEX PENSÉ POUR LE CURSEUR de la file de modération : (statut) puis
--   l'ordre TOTAL (created_at desc, id desc) sur lequel le curseur avance.
create index if not exists photo_propositions_file_idx
  on public.photo_propositions (statut, created_at desc, id desc);
create index if not exists photo_propositions_cible_idx
  on public.photo_propositions (cible_type, cible_id);
create index if not exists photo_propositions_proposeur_idx
  on public.photo_propositions (proposeur_id, created_at desc);

alter table public.photo_propositions enable row level security;

-- ⚠ LA SEULE LECTURE ACCORDÉE : la sienne, ou celle de l'administration. Un
--   membre doit pouvoir savoir où en est sa proposition — sinon il la reposte.
drop policy if exists photo_propositions_lecture on public.photo_propositions;
create policy photo_propositions_lecture on public.photo_propositions
  for select using (
    proposeur_id = (select auth.uid()) or public.is_admin()
  );

-- 🔴 AUCUNE POLICY D'ÉCRITURE, ET C'EST VOULU. Proposer passe par
--    `dk_proposer_photo()`, décider par `dk_admin_traiter_photo()`. Une policy
--    `for insert with check (proposeur_id = auth.uid())` aurait suffi à
--    l'insertion — mais elle aurait aussi laissé le client choisir `statut`,
--    `traite_par` et `traite_le` dans le corps de la requête. Le dépôt l'écrit
--    en toutes lettres : « jamais d'identifiant utilisateur venant du corps
--    d'une requête ». Même famille que `page_claims`, RPC seulement.
revoke all on public.photo_propositions from public, anon;
grant select on public.photo_propositions to authenticated;

comment on table public.photo_propositions is
  'Photos proposées par les membres. Invisibles partout tant que statut <> ''approuvee'' : aucune requête du produit ne lit cette table, seule l''approbation recopie l''URL sur la fiche visée.';

-- ── ③ Poser une photo sur sa fiche — le seul chemin vers la publication ────
-- ⚠ FONCTION INTERNE, JAMAIS EXPOSÉE. Elle écrit sur quatre tables du
--   référentiel ; elle est révoquée plus bas pour `public` ET `anon`, comme
--   0083 a dû le faire après coup pour toute la famille des fonctions qui
--   écrivent.
create or replace function public.dk_poser_photo(
  p_cible_type text,
  p_cible      uuid,
  p_url        text,
  p_credit     text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  -- ⚠ `licence` et `source` restent NULL pour une photo de membre, et ce
  --   n'est pas un oubli : il n'y a pas de licence tierce à nommer, seulement
  --   un auteur — que `credit` porte. Y écrire « CC BY » serait inventer une
  --   licence que personne n'a accordée.
  case p_cible_type
    when 'destination' then
      update public.places
         set cover_url = p_url, cover_credit = p_credit,
             cover_licence = null, cover_source = null
       where id = p_cible;
    when 'site' then
      update public.attractions
         set cover_url = p_url, cover_credit = p_credit,
             cover_licence = null, cover_source = null
       where id = p_cible;
    when 'plat' then
      update public.dishes
         set photo_url = p_url, photo_credit = p_credit,
             photo_licence = null, photo_source = null
       where id = p_cible;
    when 'etablissement' then
      update public.pages
         set cover_url = p_url, cover_credit = p_credit,
             cover_licence = null, cover_source = null
       where id = p_cible;
    else
      raise exception 'Type de fiche inconnu : %', p_cible_type;
  end case;

  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- ── ④ Le nom de la fiche visée, pour que l'écran ne montre pas un UUID ─────
create or replace function public.dk_photo_cible_nom(p_cible_type text, p_cible uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_cible_type
    when 'destination'   then (select name_fr from public.places      where id = p_cible)
    when 'site'          then (select name    from public.attractions where id = p_cible)
    when 'plat'          then (select name_fr from public.dishes      where id = p_cible)
    when 'etablissement' then (select name    from public.pages       where id = p_cible)
  end;
$$;

-- ⚠ LE LIEN VERS LA FICHE, CALCULÉ EN BASE. Le modérateur doit pouvoir aller
--   VOIR la fiche avant de trancher — une photo de plage est acceptable pour
--   une plage et absurde pour un plat. Les quatre routes n'ont ni le même
--   préfixe ni la même colonne de slug ; les recomposer côté client obligerait
--   à ramener quatre slugs de plus et à maintenir la table de correspondance à
--   deux endroits.
create or replace function public.dk_photo_cible_lien(p_cible_type text, p_cible uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_cible_type
    when 'destination'   then (select '/lieu/' || slug from public.places      where id = p_cible)
    when 'site'          then (select '/site/' || slug from public.attractions where id = p_cible)
    when 'plat'          then (select '/plat/' || slug from public.dishes      where id = p_cible)
    when 'etablissement' then (select '/p/'    || slug from public.pages       where id = p_cible)
  end;
$$;

-- ── ⑤ Proposer ─────────────────────────────────────────────────────────────
create or replace function public.dk_proposer_photo(
  p_cible_type text,
  p_cible      uuid,
  p_url        text,
  p_largeur    integer default null,
  p_hauteur    integer default null,
  p_legende    text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    uuid := (select auth.uid());
  v_id     uuid;
  v_nom    text;
  v_credit text;
begin
  if v_moi is null then
    raise exception 'Connectez-vous pour proposer une photo.' using errcode = '42501';
  end if;

  -- ⚠ LA FICHE DOIT EXISTER. Sans ce contrôle, `cible_id` accepterait
  --   n'importe quel UUID : la file se remplirait de propositions qui ne
  --   pointent nulle part, et le modérateur les découvrirait une par une.
  v_nom := public.dk_photo_cible_nom(p_cible_type, p_cible);
  if v_nom is null then
    raise exception 'Cette fiche n''existe pas.';
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Membre Diako')
    into v_credit from public.profiles where id = v_moi;

  insert into public.photo_propositions
    (proposeur_id, cible_type, cible_id, url, largeur, hauteur, legende, credit)
  values
    (v_moi, p_cible_type, p_cible, p_url, p_largeur, p_hauteur,
     nullif(trim(coalesce(p_legende, '')), ''), v_credit)
  on conflict (proposeur_id, cible_type, cible_id) where statut = 'en_attente'
    do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Vous avez déjà une photo en attente pour cette fiche.';
  end if;

  return v_id;
end $$;

-- ── ⑥ La file de modération ────────────────────────────────────────────────
create or replace function public.dk_admin_photos(
  p_statut       text        default 'en_attente',
  p_curseur_date timestamptz default null,
  p_curseur_id   uuid        default null,
  p_limite       integer     default 30
)
returns table (
  id             uuid,
  cible_type     text,
  cible_id       uuid,
  cible_nom      text,
  cible_lien     text,
  url            text,
  largeur        integer,
  hauteur        integer,
  legende        text,
  credit         text,
  statut         text,
  motif_refus    text,
  created_at     timestamptz,
  proposeur_id   uuid,
  proposeur_nom  text,
  proposeur_avatar text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;

  return query
    select f.id, f.cible_type, f.cible_id,
           public.dk_photo_cible_nom(f.cible_type, f.cible_id),
           public.dk_photo_cible_lien(f.cible_type, f.cible_id),
           f.url, f.largeur, f.hauteur, f.legende, f.credit,
           f.statut, f.motif_refus, f.created_at,
           f.proposeur_id, p.display_name, p.avatar_url
      from public.photo_propositions f
      join public.profiles p on p.id = f.proposeur_id
     where (p_statut = 'toutes' or f.statut = p_statut)
       and (
             p_curseur_date is null or p_curseur_id is null
             or (f.created_at, f.id) < (p_curseur_date, p_curseur_id)
           )
     order by f.created_at desc, f.id desc
     limit least(greatest(coalesce(p_limite, 30), 1), 100);
end $$;

-- ── ⑦ Approuver ou refuser ─────────────────────────────────────────────────
-- ⚠ TOUT SE JOUE DANS UNE SEULE TRANSACTION : la décision, la recopie sur la
--   fiche, la notification. Si la recopie échoue, la ligne ne passe pas à
--   « approuvée » — sinon l'écran dirait « publiée » sur une fiche restée nue.
create or replace function public.dk_admin_traiter_photo(
  p_proposition uuid,
  p_action      text,
  p_motif       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.photo_propositions%rowtype;
  v_motif   text := nullif(trim(coalesce(p_motif, '')), '');
  v_nom     text;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;

  select * into r from public.photo_propositions where id = p_proposition for update;
  if r.id is null then
    raise exception 'Proposition introuvable.';
  end if;
  if r.statut <> 'en_attente' then
    raise exception 'Cette proposition a déjà été traitée (%).', r.statut;
  end if;

  v_nom := public.dk_photo_cible_nom(r.cible_type, r.cible_id);

  if p_action = 'approuver' then
    if not public.dk_poser_photo(r.cible_type, r.cible_id, r.url, r.credit) then
      raise exception 'La fiche visée n''existe plus — la photo n''a pas été posée.';
    end if;

    update public.photo_propositions
       set statut = 'approuvee', traite_par = (select auth.uid()), traite_le = now()
     where id = p_proposition;

    perform public.notifier(
      r.proposeur_id, 'photo_approuvee', 'Votre photo est en ligne',
      coalesce('Elle illustre désormais ' || v_nom || '.', 'Merci pour votre photo.'),
      jsonb_build_object('cible_type', r.cible_type, 'cible_id', r.cible_id)
    );
    return 'approuvee';

  elsif p_action = 'refuser' then
    if v_motif is null then
      raise exception 'Un refus doit porter un motif.';
    end if;

    update public.photo_propositions
       set statut = 'refusee', motif_refus = v_motif,
           traite_par = (select auth.uid()), traite_le = now()
     where id = p_proposition;

    -- ⚠ LE MOTIF EST DIT AU PROPOSEUR. Un refus muet se lit comme un bug, et
    --   la personne repropose la même photo la semaine suivante.
    perform public.notifier(
      r.proposeur_id, 'photo_refusee', 'Photo non retenue', v_motif,
      jsonb_build_object('cible_type', r.cible_type, 'cible_id', r.cible_id)
    );
    return 'refusee';
  end if;

  raise exception 'Action inconnue : %. Attendu : approuver ou refuser.', p_action;
end $$;

-- ── ⑧ L'administration pose une photo directement ──────────────────────────
-- ⚠ MÊME CHEMIN QUE L'APPROBATION, PAS UN RACCOURCI. La photo posée par
--   l'administration laisse elle aussi une ligne dans `photo_propositions`,
--   déjà approuvée : sans elle, on ne saurait plus, six mois après, d'où sort
--   la couverture d'une destination ni qui l'a mise.
create or replace function public.dk_admin_poser_photo(
  p_cible_type text,
  p_cible      uuid,
  p_url        text,
  p_largeur    integer default null,
  p_hauteur    integer default null,
  p_credit     text    default null,
  p_legende    text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi    uuid := (select auth.uid());
  v_id     uuid;
  v_credit text := nullif(trim(coalesce(p_credit, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;
  if public.dk_photo_cible_nom(p_cible_type, p_cible) is null then
    raise exception 'Cette fiche n''existe pas.';
  end if;

  if not public.dk_poser_photo(p_cible_type, p_cible, p_url, v_credit) then
    raise exception 'La photo n''a pas pu être posée.';
  end if;

  insert into public.photo_propositions
    (proposeur_id, cible_type, cible_id, url, largeur, hauteur, legende, credit,
     statut, traite_par, traite_le)
  values
    (v_moi, p_cible_type, p_cible, p_url, p_largeur, p_hauteur,
     nullif(trim(coalesce(p_legende, '')), ''), v_credit,
     'approuvee', v_moi, now())
  returning id into v_id;

  return v_id;
end $$;

-- ── ⑨ Les chiffres de la console, complétés ────────────────────────────────
-- ⚠ POURQUOI ICI ET PAS DANS 0097. `photo_propositions` n'existe qu'à partir
--   de cette migration : compter dedans depuis 0097 casserait 0097 sur une
--   base neuve, où les migrations passent dans l'ordre. On remplace la
--   fonction une fois la table posée — même corps, deux compteurs de plus.
create or replace function public.dk_admin_statistiques()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'membres',              (select count(*) from public.profiles),
    'membres_7j',           (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'membres_pro',          (select count(*) from public.profiles where account_type = 'pro'),
    'publications',         (select count(*) from public.posts where status = 'published'),
    'publications_masquees',(select count(*) from public.posts where status = 'hidden'),
    'publications_retirees',(select count(*) from public.posts where status = 'removed'),
    'publications_7j',      (select count(*) from public.posts where created_at > now() - interval '7 days'),
    'commentaires',         (select count(*) from public.comments where status = 'published'),
    'signalements_ouverts', (select count(*) from public.reports where status in ('nouveau','vu')),
    'signalements_traites', (select count(*) from public.reports where status in ('traite','rejete')),
    'photos_en_attente',    (select count(*) from public.photo_propositions where statut = 'en_attente'),
    'photos_approuvees',    (select count(*) from public.photo_propositions where statut = 'approuvee'),
    'destinations',         (select count(*) from public.places),
    'destinations_photo',   (select count(*) from public.places where cover_url is not null),
    'sites',                (select count(*) from public.attractions),
    'plats',                (select count(*) from public.dishes),
    'etablissements',       (select count(*) from public.pages where is_published),
    'promos_actives',       (select count(*) from public.promo_codes where actif),
    'arrete_le',            now()
  ) into v;

  return v;
end $$;

-- ── ⑩ Droits d'exécution ───────────────────────────────────────────────────
do $$
declare f text;
begin
  -- Fonctions internes : personne ne les appelle depuis un client.
  foreach f in array array[
    'public.dk_poser_photo(text,uuid,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.dk_photo_cible_nom(text,uuid)',
    'public.dk_photo_cible_lien(text,uuid)',
    'public.dk_proposer_photo(text,uuid,text,integer,integer,text)',
    'public.dk_admin_photos(text,timestamptz,uuid,integer)',
    'public.dk_admin_traiter_photo(uuid,text,text)',
    'public.dk_admin_poser_photo(text,uuid,text,integer,integer,text,text)',
    'public.dk_admin_statistiques()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ============================================================================
-- CONTRÔLE — on PROUVE les deux promesses : « invisible tant que non
-- approuvée », et « l'approbation, elle, publie vraiment ».
-- ============================================================================
do $$
declare
  v_membre  uuid;
  v_place   uuid;
  v_avant   text;
  v_credit  text;
  v_prop    uuid;
  v_apres   text;
  v_ouvert  text;
begin
  -- ① Le piège 0082, vérifié et non supposé : les colonnes neuves de `pages`
  --    sont bien lisibles. Si `pages` est en grants par colonne et que le
  --    grant explicite n'a pas pris, l'annuaire tombe — on l'apprend ICI.
  if not has_column_privilege('anon', 'public.pages', 'cover_credit', 'select')
     or not has_column_privilege('authenticated', 'public.pages', 'cover_credit', 'select') then
    raise exception '0098 : les colonnes de crédit de pages ne sont pas lisibles — piège 0082, le grant par colonne a échoué';
  end if;

  -- ② `anon` ne voit rien de la table, ni ne peut la nourrir.
  if has_table_privilege('anon', 'public.photo_propositions', 'select')
     or has_table_privilege('anon', 'public.photo_propositions', 'insert') then
    raise exception '0098 : anon a un droit sur photo_propositions — une photo en attente serait lisible publiquement';
  end if;
  if has_table_privilege('authenticated', 'public.photo_propositions', 'insert')
     or has_table_privilege('authenticated', 'public.photo_propositions', 'update') then
    raise exception '0098 : un compte connecté peut écrire directement dans photo_propositions — il choisirait son propre statut';
  end if;
  if not exists (
    select 1 from pg_class where oid = 'public.photo_propositions'::regclass and relrowsecurity
  ) then
    raise exception '0098 : RLS n''est pas active sur photo_propositions';
  end if;

  -- ③ Aucune fonction d'administration ni la fonction interne d'écriture
  --    n'est appelable anonymement.
  select string_agg(f, ', ') into v_ouvert
    from unnest(array[
      'public.dk_poser_photo(text,uuid,text,text)',
      'public.dk_admin_photos(text,timestamptz,uuid,integer)',
      'public.dk_admin_traiter_photo(uuid,text,text)',
      'public.dk_admin_poser_photo(text,uuid,text,integer,integer,text,text)'
    ]) f
   where has_function_privilege('anon', f, 'execute');
  if v_ouvert is not null then
    raise exception '0098 : anon peut exécuter : %', v_ouvert;
  end if;
  if has_function_privilege('authenticated', 'public.dk_poser_photo(text,uuid,text,text)', 'execute') then
    raise exception '0098 : un compte connecté peut appeler dk_poser_photo et repeindre le référentiel sans passer par la modération';
  end if;

  -- ④ LA SONDE. Une proposition en attente ne touche pas la fiche ;
  --    l'approbation, si. On repose l'état d'origine dans les deux cas : une
  --    vérification ne laisse pas de trace dans ce qu'un visiteur va lire
  --    (même précaution qu'en 0092).
  select id into v_membre from public.profiles order by created_at limit 1;
  select id, cover_url, cover_credit into v_place, v_avant, v_credit
    from public.places order by id limit 1;

  if v_membre is null or v_place is null then
    raise notice '0098 : sonde non jouée — il faut au moins un profil et une destination.';
    return;
  end if;

  insert into public.photo_propositions
    (proposeur_id, cible_type, cible_id, url, credit)
  values
    (v_membre, 'destination', v_place,
     'https://sonde.invalid/uploads/0098-sonde.webp', 'Sonde 0098')
  returning id into v_prop;

  select cover_url into v_apres from public.places where id = v_place;
  if v_apres is distinct from v_avant then
    raise exception '0098 : une proposition EN ATTENTE a modifié la fiche — la photo serait visible sans approbation';
  end if;

  -- L'approbation passe par la fonction interne, exactement comme
  -- `dk_admin_traiter_photo` le fait — la migration n'a pas de JWT, elle ne
  -- peut donc pas franchir le garde `is_admin()` de la RPC publique.
  perform public.dk_poser_photo('destination', v_place,
                                'https://sonde.invalid/uploads/0098-sonde.webp', 'Sonde 0098');
  select cover_url into v_apres from public.places where id = v_place;
  if v_apres <> 'https://sonde.invalid/uploads/0098-sonde.webp' then
    raise exception '0098 : l''approbation n''a pas posé la photo sur la destination (% lu)', coalesce(v_apres, 'NULL');
  end if;

  update public.places set cover_url = v_avant, cover_credit = v_credit where id = v_place;
  delete from public.photo_propositions where id = v_prop;

  if exists (select 1 from public.places where id = v_place and cover_url is distinct from v_avant) then
    raise exception '0098 : la sonde n''a pas été effacée — une URL de test reste en base';
  end if;
end $$;
