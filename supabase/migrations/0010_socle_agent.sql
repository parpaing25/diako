-- ============================================================================
-- 0010 — SOCLE DE L'AGENT DIAKO + FICHES ÉDITORIALES
--
-- Tout ce fichier découle d'une seule décision produit : Diako aura un AGENT
-- à qui on parle en langue naturelle. « Un hôtel à Ampefy avec piscine
-- chauffée, 200 000 Ar la nuit », « un restaurant spécialiste des sushi »,
-- « un itinéraire dans le sud avec 5 000 000 Ar ».
--
-- Le partage des rôles est net, et c'est ce qui rend le système fiable :
--   · le modèle de langue TRADUIT la question en filtres structurés ;
--   · la base RÉPOND avec des faits, jamais avec du texte inventé.
--
-- D'où trois manques à combler, chacun tiré d'une question réelle :
--
--   ① « piscine CHAUFFÉE » — une piscine et une piscine chauffée ne sont pas
--      la même promesse. Il faut des équipements fins, pas une case unique.
--
--   ② « spécialiste des SUSHI » — il faut un référentiel de CUISINES, distinct
--      des plats. On ne peut pas exiger d'un japonais qu'il saisisse ses
--      soixante makis pour être trouvable comme japonais.
--
--   ③ « un itinéraire dans le SUD » — il faut des distances et des durées
--      réelles entre les lieux (migration 0012), et un axe pour que le mot
--      « sud » veuille dire quelque chose.
--
-- Plus une conséquence du lancement : au départ, c'est NOUS qui saisissons les
-- fiches (owner_id NULL = fiche éditoriale). Un propriétaire doit pouvoir
-- revendiquer la sienne — d'où page_claims.
-- ============================================================================

-- ── 1. PROVENANCE DES FICHES ÉDITORIALES ────────────────────────────────────
-- Une fiche saisie par nous doit dire D'OÙ vient l'information. C'est ce qui
-- sépare « relevé dans la liste de l'office du tourisme du lac Itasy » de
-- « trouvé quelque part ». Sur ce projet, la traçabilité des données n'est pas
-- un détail : on a déjà passé du temps à retirer des chiffres inventés.
alter table public.pages add column if not exists source text;

comment on column public.pages.source is
  'Provenance d''une fiche editoriale (owner_id NULL). NULL sur une fiche tenue par son proprietaire.';

-- ── 2. REVENDICATION D'UNE FICHE ────────────────────────────────────────────
-- Une demande, vérifiée à la main, jamais automatique : accepter un transfert
-- de propriété donne accès aux messages des clients de l'établissement. Cela
-- ne peut pas dépendre d'un clic.
create table if not exists public.page_claims (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message    text,
  telephone  text,
  statut     text not null default 'en_attente'
               check (statut in ('en_attente','acceptee','refusee')),
  traite_le  timestamptz,
  created_at timestamptz not null default now(),
  unique (page_id, user_id)
);

create index if not exists page_claims_statut_idx on public.page_claims(statut, created_at desc);
alter table public.page_claims enable row level security;

drop policy if exists page_claims_moi   on public.page_claims;
drop policy if exists page_claims_creer on public.page_claims;
drop policy if exists page_claims_admin on public.page_claims;
create policy page_claims_moi on public.page_claims for select
  using (user_id = (select auth.uid()) or public.is_staff());
create policy page_claims_creer on public.page_claims for insert
  with check (user_id = (select auth.uid()));
create policy page_claims_admin on public.page_claims for update
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.revendiquer_page(p_page uuid, p_message text, p_tel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_id uuid; v_existe boolean;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  select owner_id, true into v_prop, v_existe from public.pages where id = p_page;
  if v_existe is null then raise exception 'Cet etablissement n''existe pas.'; end if;
  if v_prop is not null then
    raise exception 'Cette fiche a deja un proprietaire. Ecrivez-nous si c''est une erreur.';
  end if;
  insert into public.page_claims (page_id, user_id, message, telephone)
  values (p_page, v_moi, nullif(btrim(coalesce(p_message,'')), ''), nullif(btrim(coalesce(p_tel,'')), ''))
  on conflict (page_id, user_id) do update
    set message = excluded.message, telephone = excluded.telephone,
        statut = 'en_attente', created_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ── 3. RÉFÉRENTIEL DES CUISINES ─────────────────────────────────────────────
create table if not exists public.cuisines (
  slug     text primary key,
  label_fr text not null,
  rang     smallint not null default 100,
  norm text generated always as (public.dk_norm(label_fr)) stored
);

create table if not exists public.cuisine_aliases (
  cuisine_slug text not null references public.cuisines(slug) on delete cascade,
  alias        text not null,
  norm text generated always as (public.dk_norm(alias)) stored,
  primary key (cuisine_slug, alias)
);

create index if not exists cuisine_aliases_norm_idx
  on public.cuisine_aliases using gin (norm extensions.gin_trgm_ops);

create table if not exists public.page_cuisines (
  page_id      uuid not null references public.pages(id) on delete cascade,
  cuisine_slug text not null references public.cuisines(slug) on delete cascade,
  primary key (page_id, cuisine_slug)
);

create index if not exists page_cuisines_slug_idx on public.page_cuisines(cuisine_slug);

alter table public.cuisines        enable row level security;
alter table public.cuisine_aliases enable row level security;
alter table public.page_cuisines   enable row level security;

drop policy if exists cuisines_lecture on public.cuisines;
drop policy if exists cuisines_admin   on public.cuisines;
create policy cuisines_lecture on public.cuisines for select using (true);
create policy cuisines_admin   on public.cuisines for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists cuisine_aliases_lecture on public.cuisine_aliases;
drop policy if exists cuisine_aliases_admin   on public.cuisine_aliases;
create policy cuisine_aliases_lecture on public.cuisine_aliases for select using (true);
create policy cuisine_aliases_admin   on public.cuisine_aliases for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists page_cuisines_lecture on public.page_cuisines;
drop policy if exists page_cuisines_gerer   on public.page_cuisines;
create policy page_cuisines_lecture on public.page_cuisines for select
  using (public.page_publiee(page_id) or public.page_a_moi(page_id));
create policy page_cuisines_gerer on public.page_cuisines for all
  using (public.page_a_moi(page_id) or public.is_admin())
  with check (public.page_a_moi(page_id) or public.is_admin());

-- Les alias sont ce qui rend la question naturelle. « japonais », « sushi »,
-- « maki » et « ramen » doivent tous tomber sur la même cuisine.
insert into public.cuisines (slug, label_fr, rang) values
  ('malgache','Malgache',10),
  ('francaise','Française',20),
  ('italienne','Italienne',30),
  ('pizzeria','Pizzeria',35),
  ('chinoise','Chinoise',40),
  ('japonaise','Japonaise',45),
  ('indienne','Indienne',50),
  ('pakistanaise','Pakistanaise',55),
  ('libanaise','Libanaise',60),
  ('thai','Thaïlandaise',65),
  ('vietnamienne','Vietnamienne',70),
  ('coreenne','Coréenne',72),
  ('americaine','Américaine',75),
  ('mexicaine','Mexicaine',80),
  ('espagnole','Espagnole',82),
  ('creole','Créole',85),
  ('fruits-de-mer','Fruits de mer',90),
  ('grillades','Grillades',95),
  ('vegetarienne','Végétarienne',100),
  ('gastronomique','Gastronomique',105),
  ('brasserie','Brasserie',110),
  ('patisserie','Pâtisserie et salon de thé',115),
  ('boulangerie','Boulangerie',120),
  ('glacier','Glacier',125),
  ('street-food','Street food',130),
  ('buffet','Buffet',135),
  ('halal','Halal',140)
on conflict (slug) do update set label_fr = excluded.label_fr, rang = excluded.rang;

insert into public.cuisine_aliases (cuisine_slug, alias) values
  ('malgache','gasy'),('malgache','cuisine malgache'),('malgache','hotely gasy'),
  ('malgache','traditionnel'),('malgache','laoka'),
  ('francaise','france'),('francaise','cuisine francaise'),
  ('italienne','italien'),('italienne','pates'),('italienne','pasta'),
  ('pizzeria','pizza'),('pizzeria','pizzas'),
  ('chinoise','chinois'),('chinoise','asiatique'),('chinoise','soupe chinoise'),
  ('japonaise','japonais'),('japonaise','sushi'),('japonaise','sushis'),
  ('japonaise','maki'),('japonaise','makis'),('japonaise','sashimi'),
  ('japonaise','ramen'),('japonaise','teppanyaki'),
  ('indienne','indien'),('indienne','curry'),('indienne','tandoori'),
  ('pakistanaise','pakistanais'),('pakistanaise','briani'),
  ('libanaise','libanais'),('libanaise','mezze'),('libanaise','chawarma'),
  ('thai','thailandais'),('thai','thai'),
  ('vietnamienne','vietnamien'),('vietnamienne','pho'),('vietnamienne','bo bun'),
  ('coreenne','coreen'),('coreenne','bibimbap'),
  ('americaine','burger'),('americaine','burgers'),('americaine','hamburger'),
  ('americaine','fast food'),
  ('mexicaine','mexicain'),('mexicaine','tacos'),
  ('espagnole','espagnol'),('espagnole','tapas'),('espagnole','paella'),
  ('creole','reunionnais'),('creole','rougail'),
  ('fruits-de-mer','poisson'),('fruits-de-mer','langouste'),('fruits-de-mer','crustaces'),
  ('fruits-de-mer','seafood'),
  ('grillades','grill'),('grillades','barbecue'),('grillades','brochettes'),
  ('grillades','zebu grille'),
  ('vegetarienne','vegetarien'),('vegetarienne','vegan'),('vegetarienne','sans viande'),
  ('gastronomique','gastro'),('gastronomique','haute cuisine'),
  ('brasserie','bistrot'),
  ('patisserie','salon de the'),('patisserie','gateaux'),('patisserie','the'),
  ('boulangerie','pain'),('boulangerie','viennoiserie'),
  ('glacier','glace'),('glacier','glaces'),
  ('street-food','rue'),('street-food','sur le pouce'),
  ('halal','sans porc'),('halal','musulman')
on conflict (cuisine_slug, alias) do nothing;

-- ── 4. ÉQUIPEMENTS FINS ─────────────────────────────────────────────────────
-- « Piscine chauffée » est une entrée à part entière, pas une nuance de
-- « piscine » : c'est exactement le genre de contrainte qu'un voyageur pose,
-- et une case unique la rendrait infiltrable.
--
-- Les entrées spécifiquement malgaches valent d'être notées : groupe
-- électrogène (délestages JIRAMA), eau potable fournie, gardien de nuit,
-- Mvola / Orange Money / Airtel Money séparés — « mobile money » ne dit pas
-- lequel, et on ne paie pas avec l'opérateur du voisin.
insert into public.amenities (code, label_fr, label_mg, category, applies_to, rang) values
  ('piscine-chauffee','Piscine chauffée','Dobo mafana','confort',array['hotel'],41),
  ('jacuzzi','Jacuzzi','Jacuzzi','confort',array['hotel'],42),
  ('spa','Spa','Spa','confort',array['hotel'],43),
  ('hammam','Hammam','Hammam','confort',array['hotel'],44),
  ('massage','Massages','Fikosehana','confort',array['hotel'],46),
  ('vue-lac','Vue sur le lac','Mahita farihy','confort',array['hotel','restaurant'],47),
  ('vue-montagne','Vue sur la montagne','Mahita tendrombohitra','confort',array['hotel','restaurant'],48),
  ('cheminee','Cheminée','Fatana','confort',array['hotel'],52),
  ('salle-sport','Salle de sport','Efitra fanatanjahantena','confort',array['hotel'],57),
  ('tv','Télévision','Fahitalavitra','confort',array['hotel'],58),
  ('panneaux-solaires','Panneaux solaires','Masoandro','confort',array['hotel'],62),
  ('eau-potable','Eau potable fournie','Rano fisotro','confort',array['hotel'],63),
  ('demi-pension','Demi-pension possible','Sakafo indroa','restauration',array['hotel'],101),
  ('pension-complete','Pension complète possible','Sakafo intelo','restauration',array['hotel'],102),
  ('tennis','Tennis','Tenisy','activite',array['hotel'],240),
  ('billard','Billard','Bilara','activite',array['hotel'],242),
  ('equitation','Équitation','Fitaingenan-tsoavaly','activite',array['hotel','agence'],245),
  ('vtt','VTT','Bisikileta','activite',array['hotel','agence'],247),
  ('quad','Quad','Quad','activite',array['hotel','agence'],248),
  ('pedalo','Pédalo','Pedalo','activite',array['hotel'],250),
  ('plage-privee','Plage privée','Toerana manokana','activite',array['hotel'],252),
  ('ponton','Ponton','Tetezana','activite',array['hotel'],253),
  ('feu-de-camp','Feu de camp','Afo','activite',array['hotel'],255),
  ('parking-clos','Parking clos','Fiantsonana voafefy','acces',array['hotel','restaurant'],301),
  ('gardien-nuit','Gardien de nuit','Mpiambina alina','services',array['hotel'],401),
  ('mvola','Mvola','Mvola','services',array['hotel','restaurant','agence'],402),
  ('orange-money','Orange Money','Orange Money','services',array['hotel','restaurant','agence'],403),
  ('airtel-money','Airtel Money','Airtel Money','services',array['hotel','restaurant','agence'],404),
  ('bagagerie','Bagagerie','Fitehirizam-entana','services',array['hotel'],416),
  ('chambre-familiale','Chambre familiale','Efitra fianakaviana','famille',array['hotel'],501),
  ('acces-handicape','Accessible aux personnes handicapées','Mora idirana','acces',array['hotel','restaurant'],320)
on conflict (code) do update set
  label_fr = excluded.label_fr, label_mg = excluded.label_mg,
  category = excluded.category, applies_to = excluded.applies_to, rang = excluded.rang;

-- ── 5. PRIVILÈGES ───────────────────────────────────────────────────────────
revoke insert, update, delete on public.cuisines, public.cuisine_aliases,
  public.page_cuisines, public.page_claims from anon;
revoke select on public.page_claims from anon;
revoke execute on function public.revendiquer_page(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.revendiquer_page(uuid, text, text) to authenticated;
