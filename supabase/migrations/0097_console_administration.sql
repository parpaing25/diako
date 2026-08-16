-- ============================================================================
-- 0097 — LA CONSOLE D'ADMINISTRATION, GARDÉE PAR LE SERVEUR
--
-- 🔴 CE QUI MANQUAIT. Il n'existe aucun écran d'administration. Les
--    signalements s'empilent dans `reports` — `masquer_si_signale()` cache une
--    publication au 3ᵉ signalement distinct — et PERSONNE ne peut les relire :
--    la policy `reports_admin` réserve la lecture à `is_staff()`, et aucun
--    compte ne porte ce rôle. La file existe, elle se remplit, elle n'est
--    jamais vidée. 0044 l'écrivait déjà noir sur blanc (« ces signalements
--    alimentent une file, relue à la main ») — la main n'avait pas d'écran.
--
-- ⚠ POURQUOI L'ADRESSE E-MAIL ENTRE DANS `is_admin()`, ET PAS DANS UNE
--   FONCTION À CÔTÉ. Le propriétaire veut que la console soit liée au compte
--   `contact.diako@gmail.com`. La tentation est d'écrire une deuxième fonction
--   — `dk_est_admin()` — et de s'en servir dans la console. Ce serait rejouer
--   exactement l'erreur que 0001 dit avoir refusée chez Fonenako : DEUX
--   systèmes de droits concurrents. Le jour où les deux divergent, la console
--   dit « vous êtes admin » et le déclencheur `pages_avant_ecriture` annule
--   l'écriture EN SILENCE — le défaut le plus long à comprendre de ce dépôt
--   (voir 0092). On élargit donc la fonction QUI EXISTE DÉJÀ : tout ce qui
--   s'appuie sur `is_admin()` — les triggers de gel, les policies du bucket
--   `justificatifs` (0078/0084), `reports_admin` via `is_staff()` — reconnaît
--   le propriétaire du même coup, sans qu'une seule ligne soit retouchée.
--
-- ⚠ L'ADRESSE VIT DANS UNE SEULE FONCTION. `dk_compte_proprietaire()` la porte ;
--   `is_admin()` et `is_staff()` l'appellent. La changer, c'est changer un mot
--   à un seul endroit — pas la chercher dans six policies.
--
-- ⚠ L'E-MAIL DOIT ÊTRE CONFIRMÉ. Sans cette condition, si la confirmation par
--   e-mail est un jour désactivée dans le tableau de bord Supabase, n'importe
--   qui s'inscrit avec `contact.diako@gmail.com` et devient administrateur sans
--   jamais avoir ouvert la boîte. Supabase renseigne `email_confirmed_at` dès
--   l'inscription quand l'auto-confirmation est active : la condition ne coûte
--   rien dans les deux configurations, et ferme la porte dans la mauvaise.
--
-- ⚠ LE RÔLE EST QUAND MÊME SEMÉ DANS `user_roles`. L'e-mail est la ceinture,
--   la ligne de `user_roles` les bretelles : si le compte existe déjà, il
--   gagne son rôle ici, et la console marche même le jour où quelqu'un
--   réduira `is_admin()` à sa forme d'origine.
--
-- ⚠ AUCUNE TABLE N'EST OUVERTE À `anon`. La console lit par RPC
--   `SECURITY DEFINER`, chacune gardée par `is_admin()` en PREMIÈRE ligne. Un
--   `if` en React n'est pas un contrôle : il ne protège que l'affichage, et
--   la clé anonyme est publique par construction.
-- ============================================================================

-- ── ① L'adresse du propriétaire, à un seul endroit ─────────────────────────
create or replace function public.dk_compte_proprietaire()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = (select auth.uid())
       and lower(u.email) = 'contact.diako@gmail.com'
       and u.email_confirmed_at is not null
  );
$$;

comment on function public.dk_compte_proprietaire() is
  'Vrai si la session appartient au compte propriétaire de Diako. Seul endroit du schéma où l''adresse est écrite.';

-- ── ② Les deux fonctions de droits, élargies — contrat inchangé ────────────
-- ⚠ MÊME SIGNATURE, MÊME `stable`, MÊME `security definer`, MÊME retour
--   booléen : rien de ce qui les appelle aujourd'hui n'a à changer. On ajoute
--   une branche, on n'en retire aucune.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.dk_compte_proprietaire()
      or exists (
           select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
         );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.dk_compte_proprietaire()
      or exists (
           select 1 from public.user_roles
            where user_id = (select auth.uid()) and role in ('admin', 'moderateur')
         );
$$;

-- ⚠ 0018 avait dû rendre ces deux fonctions exécutables par `anon` : des
--   policies de LECTURE les appellent, et sans le grant la lecture anonyme
--   partait en erreur. On le repose — un `create or replace` conserve les
--   droits, mais on ne parie pas là-dessus.
grant execute on function public.dk_compte_proprietaire() to anon, authenticated;
grant execute on function public.is_admin()  to anon, authenticated;
grant execute on function public.is_staff()  to anon, authenticated;

-- ── ③ Les bretelles : le rôle semé si le compte existe déjà ────────────────
-- 🔴 LE SEMIS EXIGE LA MÊME CONFIRMATION QUE LA RECONNAISSANCE PAR E-MAIL.
--    Sans cette condition, le semis serait le trou que la condition d'e-mail
--    vient de fermer : si quelqu'un s'est inscrit avec cette adresse SANS
--    jamais ouvrir la boîte, il recevrait ici un rôle `admin` durable, que
--    `is_admin()` honorerait ensuite sans plus jamais regarder l'e-mail.
do $$
declare v_id uuid;
begin
  select u.id into v_id
    from auth.users u
   where lower(u.email) = 'contact.diako@gmail.com'
     and u.email_confirmed_at is not null
   order by u.created_at
   limit 1;

  if v_id is null then
    raise notice '0097 : aucun compte contact.diako@gmail.com confirmé — l''accès reposera sur la reconnaissance de l''e-mail à la première connexion.';
  else
    insert into public.user_roles (user_id, role)
    values (v_id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
end $$;

-- ── ④ Les codes promo ──────────────────────────────────────────────────────
-- ⚠ CE QU'UN CODE PROMO EST ICI, ET CE QU'IL N'EST PAS. Diako met en relation :
--   « Demander », jamais « Réserver » ni « Payer ». Il n'y a ni panier, ni
--   paiement, ni compte client. Un code n'est donc PAS un moyen de paiement :
--   c'est un avantage qu'un partenaire accorde et que le voyageur MENTIONNE
--   sur place. `avantage` est un texte saisi à la main (« −10 % sur la
--   nuitée ») et non un nombre : rien dans ce dépôt ne sait calculer une
--   remise, et un pourcentage stocké laisserait croire le contraire.
--
-- 🔴 NI `usage_count` NI `usage_max` — ET C'EST DÉLIBÉRÉ. Aucun écran ne
--    consomme un code : rien, nulle part, n'incrémenterait ce compteur. 0092 a
--    passé une migration entière à réparer deux compteurs affichés que rien
--    n'alimentait ; en poser un troisième le jour même serait un défaut connu
--    créé volontairement. Le jour où un parcours de validation existera, la
--    colonne viendra AVEC lui, et pas avant. La console dit franchement qu'elle
--    ne compte pas les utilisations.
create table if not exists public.promo_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null check (char_length(trim(code)) between 3 and 32),
  libelle    text not null check (char_length(trim(libelle)) between 3 and 120),
  detail     text check (detail is null or char_length(detail) <= 500),
  page_id    uuid references public.pages(id) on delete set null,
  avantage   text check (avantage is null or char_length(avantage) <= 120),
  debut      date,
  fin        date,
  actif      boolean not null default true,
  cree_par   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promo_codes_periode check (debut is null or fin is null or fin >= debut)
);

-- ⚠ UNICITÉ INSENSIBLE À LA CASSE. Le voyageur tape « ete2026 », l'affiche dit
--   « ETE2026 » : deux lignes pour un même code seraient deux vérités.
create unique index if not exists promo_codes_code_uniq
  on public.promo_codes (upper(trim(code)));
create index if not exists promo_codes_page_idx on public.promo_codes (page_id);

alter table public.promo_codes enable row level security;

-- ⚠ DEUX VERROUS, PAS UN. La policy réserve la table à l'administration ; les
--   révocations ci-dessous font qu'aucun rôle client n'a même le droit de
--   TENTER la lecture. Le premier verrou tombe si quelqu'un désactive RLS, le
--   second si quelqu'un pose un grant. Il faut les deux erreurs pour ouvrir.
drop policy if exists promo_codes_admin on public.promo_codes;
create policy promo_codes_admin on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ⚠ `public` ET `anon` NOMMÉS TOUS LES DEUX. Un `revoke ... from public`
--   n'enlève pas un droit venu d'`ALTER DEFAULT PRIVILEGES` sur `anon` : c'est
--   la leçon de 0083, et elle a coûté une migration de rattrapage.
revoke all on public.promo_codes from public, anon, authenticated;

-- ── ⑤ Les RPC de la console ────────────────────────────────────────────────
-- ⚠ TOUTES SUR LE MÊME MOULE : `security definer`, `search_path` fixé, et
--   `is_admin()` en PREMIÈRE instruction. Le garde est dans la fonction, pas
--   à l'appel : une fonction qui vérifie ailleurs est une fonction ouverte.

-- ⑤.a Les chiffres — comptés en SQL.
-- ⚠ POURQUOI PAS `select` PUIS `data.length` CÔTÉ CLIENT. PostgREST plafonne
--   silencieusement à 1000 lignes : au 1001ᵉ membre, un comptage côté client
--   afficherait 1000 pour toujours, sans une seule erreur. Un `count(*)` SQL
--   ne ment jamais.
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

-- ⑤.b Les membres — curseur, jamais d'offset.
-- ⚠ L'ORDRE EST TOTAL. `created_at desc` seul laisserait deux inscriptions de
--   la même seconde dans un ordre indécis, et la page suivante en sauterait
--   une ou la répéterait. On départage par `id`, et le curseur est un
--   COUPLE : sur un tri descendant, on demande ce qui est plus PETIT.
create or replace function public.dk_admin_membres(
  p_curseur_date timestamptz default null,
  p_curseur_id   uuid        default null,
  p_limite       integer     default 40,
  p_recherche    text        default null
)
returns table (
  id              uuid,
  email           text,
  display_name    text,
  avatar_url      text,
  account_type    text,
  verification    text,
  posts_count     integer,
  followers_count integer,
  roles           text[],
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_q text := nullif(trim(coalesce(p_recherche, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;

  return query
    select p.id, p.email, p.display_name, p.avatar_url, p.account_type,
           p.verification, p.posts_count, p.followers_count,
           coalesce(
             (select array_agg(r.role order by r.role)
                from public.user_roles r where r.user_id = p.id),
             '{}'::text[]
           ) as roles,
           p.created_at
      from public.profiles p
     where (
             p_curseur_date is null or p_curseur_id is null
             or (p.created_at, p.id) < (p_curseur_date, p_curseur_id)
           )
       and (
             v_q is null
             or p.display_name ilike '%' || v_q || '%'
             or p.email        ilike '%' || v_q || '%'
           )
     order by p.created_at desc, p.id desc
     limit least(greatest(coalesce(p_limite, 40), 1), 100);
end $$;

-- ⑤.c Les publications à relire.
-- ⚠ LE NOMBRE DE SIGNALEMENTS VOYAGE AVEC LA LIGNE. Sans lui, l'écran montre
--   une publication masquée sans dire pourquoi, et le motif est justement ce
--   qui permet de trancher en dix secondes.
create or replace function public.dk_admin_publications(
  p_statut       text        default 'signalees',
  p_curseur_date timestamptz default null,
  p_curseur_id   uuid        default null,
  p_limite       integer     default 30
)
returns table (
  id              uuid,
  body            text,
  media           jsonb,
  kind            text,
  status          text,
  created_at      timestamptz,
  auteur_id       uuid,
  auteur_nom      text,
  auteur_avatar   text,
  nb_signalements bigint,
  motifs          text[]
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
    with s as (
      select r.target_id,
             count(*) as n,
             (array_agg(r.reason order by r.created_at desc))[1:5] as motifs
        from public.reports r
       where r.target_type = 'post'
         and r.status in ('nouveau', 'vu')
       group by r.target_id
    )
    select t.id, t.body, t.media, t.kind, t.status, t.created_at,
           t.author_id, a.display_name, a.avatar_url,
           coalesce(s.n, 0), coalesce(s.motifs, '{}'::text[])
      from public.posts t
      join public.profiles a on a.id = t.author_id
      left join s on s.target_id = t.id
     where case p_statut
             when 'signalees' then s.n is not null or t.status = 'hidden'
             when 'masquees'  then t.status = 'hidden'
             when 'retirees'  then t.status = 'removed'
             when 'toutes'    then true
             else s.n is not null or t.status = 'hidden'
           end
       and (
             p_curseur_date is null or p_curseur_id is null
             or (t.created_at, t.id) < (p_curseur_date, p_curseur_id)
           )
     order by t.created_at desc, t.id desc
     limit least(greatest(coalesce(p_limite, 30), 1), 100);
end $$;

-- ⑤.d Autoriser, masquer ou retirer une publication.
-- ⚠ LES SIGNALEMENTS SONT SOLDÉS DANS LA MÊME TRANSACTION. Les laisser
--   « nouveau » après décision remettrait la publication dans la file au
--   prochain chargement, et `masquer_si_signale()` la re-masquerait à la
--   première relecture — l'écran défaisant ce que l'écran vient de faire.
create or replace function public.dk_admin_moderer_publication(
  p_post   uuid,
  p_action text,
  p_motif  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut  text;
  v_auteur  uuid;
  v_motif   text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;

  v_statut := case p_action
                when 'autoriser' then 'published'
                when 'masquer'   then 'hidden'
                when 'retirer'   then 'removed'
              end;
  if v_statut is null then
    raise exception 'Action inconnue : %. Attendu : autoriser, masquer ou retirer.', p_action;
  end if;

  update public.posts set status = v_statut
   where id = p_post
   returning author_id into v_auteur;

  if v_auteur is null then
    raise exception 'Publication introuvable.';
  end if;

  update public.reports
     set status = case when p_action = 'autoriser' then 'rejete' else 'traite' end
   where target_type = 'post' and target_id = p_post and status in ('nouveau', 'vu');

  -- ⚠ L'AUTEUR EST PRÉVENU, SAUF QUAND ON LUI REND SA PUBLICATION SANS QU'IL
  --   AIT RIEN VU PASSER : une notification « votre publication est de nouveau
  --   visible » à quelqu'un qui ignorait qu'elle ne l'était plus crée
  --   l'inquiétude qu'elle prétend lever.
  if p_action <> 'autoriser' then
    perform public.notifier(
      v_auteur,
      'moderation',
      case p_action when 'masquer' then 'Publication masquée' else 'Publication retirée' end,
      coalesce(v_motif, 'Notre équipe a relu cette publication.'),
      jsonb_build_object('post_id', p_post, 'action', p_action)
    );
  end if;

  return v_statut;
end $$;

-- ⑤.e Donner ou retirer le rôle de modérateur.
-- 🔴 LA CONSOLE NE DISTRIBUE PAS LE RÔLE `admin`. Si elle le faisait, un
--    modérateur promu par erreur pourrait se promouvoir administrateur, puis
--    retirer le propriétaire : l'escalade tiendrait en deux clics. Le rôle
--    `admin` vient de l'adresse e-mail, vérifiée par le serveur, et de nulle
--    part ailleurs.
create or replace function public.dk_admin_role(
  p_membre   uuid,
  p_accorder boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;
  if p_membre is null then
    raise exception 'Membre non précisé.';
  end if;

  if p_accorder then
    insert into public.user_roles (user_id, role) values (p_membre, 'moderateur')
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_membre and role = 'moderateur';
  end if;

  return p_accorder;
end $$;

-- ⑤.f Les codes promo — lire, enregistrer, supprimer.
create or replace function public.dk_admin_promos()
returns table (
  id           uuid,
  code         text,
  libelle      text,
  detail       text,
  page_id      uuid,
  page_nom     text,
  avantage     text,
  debut        date,
  fin          date,
  actif        boolean,
  created_at   timestamptz
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
    select c.id, c.code, c.libelle, c.detail, c.page_id, g.name,
           c.avantage, c.debut, c.fin, c.actif, c.created_at
      from public.promo_codes c
      left join public.pages g on g.id = c.page_id
     order by c.actif desc, c.created_at desc, c.id desc
     limit 500;
end $$;

create or replace function public.dk_admin_promo_enregistrer(
  p_id       uuid    default null,
  p_code     text    default null,
  p_libelle  text    default null,
  p_detail   text    default null,
  p_page     uuid    default null,
  p_avantage text    default null,
  p_debut    date    default null,
  p_fin      date    default null,
  p_actif    boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;
  if char_length(v_code) < 3 then
    raise exception 'Le code doit faire au moins 3 caractères.';
  end if;
  if char_length(trim(coalesce(p_libelle, ''))) < 3 then
    raise exception 'Le libellé est obligatoire.';
  end if;

  if p_id is null then
    insert into public.promo_codes (code, libelle, detail, page_id, avantage, debut, fin, actif, cree_par)
    values (v_code, trim(p_libelle), nullif(trim(coalesce(p_detail, '')), ''), p_page,
            nullif(trim(coalesce(p_avantage, '')), ''), p_debut, p_fin, coalesce(p_actif, true),
            (select auth.uid()))
    returning id into v_id;
  else
    update public.promo_codes
       set code     = v_code,
           libelle  = trim(p_libelle),
           detail   = nullif(trim(coalesce(p_detail, '')), ''),
           page_id  = p_page,
           avantage = nullif(trim(coalesce(p_avantage, '')), ''),
           debut    = p_debut,
           fin      = p_fin,
           actif    = coalesce(p_actif, true)
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Code promo introuvable.';
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.dk_admin_promo_supprimer(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration de Diako.' using errcode = '42501';
  end if;
  delete from public.promo_codes where id = p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- ── ⑥ Droits d'exécution ───────────────────────────────────────────────────
-- ⚠ `public` ET `anon` NOMMÉS À CHAQUE LIGNE (leçon de 0083). `authenticated`
--   seul garde l'exécution : le garde `is_admin()` fait le reste, et une
--   fonction qu'`anon` ne peut pas appeler est une surface d'attaque en moins.
do $$
declare f text;
begin
  foreach f in array array[
    'public.dk_admin_statistiques()',
    'public.dk_admin_membres(timestamptz,uuid,integer,text)',
    'public.dk_admin_publications(text,timestamptz,uuid,integer)',
    'public.dk_admin_moderer_publication(uuid,text,text)',
    'public.dk_admin_role(uuid,boolean)',
    'public.dk_admin_promos()',
    'public.dk_admin_promo_enregistrer(uuid,text,text,text,uuid,text,date,date,boolean)',
    'public.dk_admin_promo_supprimer(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ============================================================================
-- CONTRÔLE — ce qui suit PROUVE l'effet, il ne le suppose pas.
-- ============================================================================
do $$
declare
  v_ouvert text;
  v_id     uuid;
begin
  -- ① Sans session, personne n'est administrateur. La migration tourne sans
  --    JWT : `auth.uid()` vaut NULL, et les trois fonctions doivent dire non.
  --    Si l'élargissement par e-mail avait été mal écrit — un `or` mal placé,
  --    un `exists` sans filtre — c'est ICI que ça se voit, pas en production.
  --
  -- ⚠ CET APPEL PROUVE AUSSI LA LECTURE DE `auth.users`. `is_admin()` est
  --   appelée par une dizaine de policies : si son propriétaire ne pouvait pas
  --   lire `auth.users`, TOUTES tomberaient en erreur de permission. Comme
  --   `dk_compte_proprietaire()` est `security definer`, elle s'exécute ici
  --   sous exactement le rôle qui l'exécutera en production — une erreur de
  --   droit ferait échouer la migration à cette ligne, pas l'application.
  if public.dk_compte_proprietaire() or public.is_admin() or public.is_staff() then
    raise exception '0097 : une session SANS utilisateur est reconnue comme administrateur — l''élargissement par e-mail ouvre la porte à tout le monde';
  end if;

  -- ② Aucune RPC d'administration n'est appelable anonymement.
  select string_agg(f, ', ') into v_ouvert
    from unnest(array[
      'public.dk_admin_statistiques()',
      'public.dk_admin_membres(timestamptz,uuid,integer,text)',
      'public.dk_admin_publications(text,timestamptz,uuid,integer)',
      'public.dk_admin_moderer_publication(uuid,text,text)',
      'public.dk_admin_role(uuid,boolean)',
      'public.dk_admin_promos()',
      'public.dk_admin_promo_enregistrer(uuid,text,text,text,uuid,text,date,date,boolean)',
      'public.dk_admin_promo_supprimer(uuid)'
    ]) f
   where has_function_privilege('anon', f, 'execute');
  if v_ouvert is not null then
    raise exception '0097 : anon peut exécuter des fonctions d''administration : %', v_ouvert;
  end if;

  -- ③ La table des codes promo est fermée aux deux rôles clients, et RLS est
  --    bien active — les deux verrous, vérifiés séparément.
  if has_table_privilege('anon', 'public.promo_codes', 'select')
     or has_table_privilege('authenticated', 'public.promo_codes', 'select') then
    raise exception '0097 : promo_codes est lisible par un rôle client — la révocation n''a pas pris';
  end if;
  if not exists (
    select 1 from pg_class where oid = 'public.promo_codes'::regclass and relrowsecurity
  ) then
    raise exception '0097 : RLS n''est pas active sur promo_codes';
  end if;

  -- ④ Les fonctions de droits ont bien gardé leur `search_path` fixé. Une
  --    fonction `security definer` sans `search_path` est une escalade en
  --    attente : c'est la règle du dépôt, on la vérifie au lieu de l'espérer.
  if exists (
    select 1 from pg_proc p
     where p.oid in ('public.is_admin()'::regprocedure,
                     'public.is_staff()'::regprocedure,
                     'public.dk_compte_proprietaire()'::regprocedure)
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%'
       )
  ) then
    raise exception '0097 : une fonction de droits security definer a perdu son search_path';
  end if;

  -- ⑤ Si le compte propriétaire existe, il porte le rôle. Sinon on le dit —
  --    sans faire échouer la migration : le compte peut être créé après.
  select u.id into v_id from auth.users u
   where lower(u.email) = 'contact.diako@gmail.com'
     and u.email_confirmed_at is not null
   limit 1;

  if v_id is not null and not exists (
    select 1 from public.user_roles where user_id = v_id and role = 'admin'
  ) then
    raise exception '0097 : le compte propriétaire existe mais n''a pas reçu le rôle admin';
  end if;

  -- ⚠ LE CAS QUI COÛTERAIT UNE HEURE DE RECHERCHE : le compte existe, mais son
  --   adresse n'a jamais été confirmée. `is_admin()` répondra `false` et la
  --   console affichera « cet espace est réservé » à son propriétaire, sans
  --   rien expliquer. On le dit ICI, au moment où c'est réparable.
  if v_id is null then
    if exists (select 1 from auth.users where lower(email) = 'contact.diako@gmail.com') then
      raise warning '0097 : le compte contact.diako@gmail.com existe mais son adresse N''EST PAS CONFIRMÉE — la console le refusera. Confirmer l''adresse, puis rejouer le semis de rôle.';
    else
      raise notice '0097 : contrôle partiel — le compte propriétaire n''existe pas encore.';
    end if;
  end if;
end $$;
