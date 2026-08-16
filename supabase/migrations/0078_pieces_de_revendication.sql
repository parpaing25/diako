-- ============================================================================
-- 0078 — LES PIÈCES DE REVENDICATION : NIF, STAT, PREUVE DE GESTION
--
-- 🔴 CE PROJET A DÉJÀ EXPOSÉ DES CARTES D'IDENTITÉ. Le 31/07/2026,
--    `diako.fonenako.mg/backend/uploads/` listait publiquement des scans de CIN.
--    Le dossier a été supprimé. On s'apprête à redemander des pièces — c'est
--    donc ici que tout se joue.
--
-- ⚠ LE SEUL CHEMIN D'IMAGE DU PRODUIT EST INTERDIT ICI. `o2upload.php` écrit
--   dans `public/uploads/`, servi par le web, ET fabrique une vignette publique.
--   C'est très exactement là où ces pièces ne doivent PAS aller. CLAUDE.md :
--   « Aucun document d'identité dans un dossier servi par le web. Bucket privé
--   + URL signées courtes. » C'est la seule exception à la règle « aucune image
--   dans Supabase Storage », et elle est écrite pour ce cas.
--
-- ⚠ MÊME LA PHOTO DU LIEU PASSE PAR LE BUCKET PRIVÉ. Contre-intuitif, mais :
--   sur un Android d'entrée de gamme, la photo juste au-dessus de la façade
--   dans la galerie est souvent une photo de famille. La publier au dépôt, avant
--   tout regard humain, c'est publier ce qui a été choisi par erreur. Elle ne
--   sera recopiée en public qu'à l'acceptation.
--
-- ⚠ AUCUN BADGE NE SORT D'UN FORMULAIRE. `verification_status` n'est PAS dérivé
--   de la présence des champs : recopier son NIF dans la case STAT passerait
--   n'importe quelle vérification de forme. C'est un humain qui accorde.
-- ============================================================================

alter table public.page_claims add column if not exists nif  text;
alter table public.page_claims add column if not exists stat text;
alter table public.page_claims add column if not exists piece_chemin text;
alter table public.page_claims add column if not exists photo_lieu_chemin text;
alter table public.page_claims add column if not exists role_declare text;
alter table public.page_claims add column if not exists pieces_purgees_le timestamptz;

alter table public.page_claims drop constraint if exists page_claims_role_check;
alter table public.page_claims add constraint page_claims_role_check
  check (role_declare is null or role_declare = any (array[
    'proprietaire','gerant','employe_mandate','autre'
  ]));

comment on column public.page_claims.nif is
  'Numero d''Identification Fiscale declare. JAMAIS affiche publiquement. Non verifie automatiquement : sa seule presence ne prouve rien.';
comment on column public.page_claims.piece_chemin is
  'Chemin dans le bucket PRIVE `justificatifs`. Jamais une URL publique.';

-- ── Le bucket privé ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 6291456,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ⚠ CHACUN DANS SON DOSSIER, ET PERSONNE NE LIT CELUI DES AUTRES. Le chemin
--   commence par l'identifiant du compte : la policy compare le premier segment
--   a `auth.uid()`. Sans ce prefixe, un chemin devine donnerait acces a la
--   piece d'identite d'un autre.
drop policy if exists justif_depose on storage.objects;
create policy justif_depose on storage.objects for insert to authenticated
  with check (
    bucket_id = 'justificatifs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists justif_lit_le_sien on storage.objects;
create policy justif_lit_le_sien on storage.objects for select to authenticated
  using (
    bucket_id = 'justificatifs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

drop policy if exists justif_remplace on storage.objects;
create policy justif_remplace on storage.objects for update to authenticated
  using (
    bucket_id = 'justificatifs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ⚠ ON PEUT RETIRER SES PROPRES PIÈCES. Quelqu'un qui renonce doit pouvoir
--   reprendre ses papiers ; l'administration aussi, pour la purge.
drop policy if exists justif_supprime on storage.objects;
create policy justif_supprime on storage.objects for delete to authenticated
  using (
    bucket_id = 'justificatifs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

-- ── Le dépôt, en une seule écriture ─────────────────────────────────────────
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
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_existe boolean;
        v_type text; v_id uuid; v_deja text;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;

  select account_type into v_type from public.profiles where id = v_moi;
  if v_type is distinct from 'pro' then
    raise exception 'Seuls les comptes professionnels peuvent revendiquer un etablissement.';
  end if;

  select owner_id, true into v_prop, v_existe from public.pages where id = p_page;
  if v_existe is null then raise exception 'Cet etablissement n''existe pas.'; end if;
  if v_prop is not null then
    raise exception 'Cette fiche a deja un proprietaire. Ecrivez-nous si c''est une erreur.';
  end if;

  -- 🔴 UNE DEMANDE EN ATTENTE NE SE REMPLACE PAS EN SILENCE. Re-cliquer
  --    « C'est mon etablissement » ecrasait le dossier deja depose et le
  --    renvoyait en fin de file, sans un mot : quelqu'un qui n'a pas eu de
  --    reponse en trois jours et qui reessaie se punissait lui-meme.
  select statut into v_deja from public.page_claims
   where page_id = p_page and user_id = v_moi;
  if v_deja = 'en_attente' then
    select id into v_id from public.page_claims
     where page_id = p_page and user_id = v_moi;
    return v_id;
  end if;

  insert into public.page_claims
    (page_id, user_id, message, telephone, nif, stat,
     piece_chemin, photo_lieu_chemin, role_declare)
  values
    (p_page, v_moi,
     nullif(btrim(coalesce(p_message,'')), ''),
     nullif(btrim(coalesce(p_tel,'')), ''),
     nullif(btrim(coalesce(p_nif,'')), ''),
     nullif(btrim(coalesce(p_stat,'')), ''),
     nullif(btrim(coalesce(p_piece,'')), ''),
     nullif(btrim(coalesce(p_photo_lieu,'')), ''),
     nullif(btrim(coalesce(p_role,'')), ''))
  on conflict (page_id, user_id) do update
    set message = excluded.message, telephone = excluded.telephone,
        nif = excluded.nif, stat = excluded.stat,
        piece_chemin = excluded.piece_chemin,
        photo_lieu_chemin = excluded.photo_lieu_chemin,
        role_declare = excluded.role_declare,
        statut = 'en_attente', created_at = now(),
        -- ⚠ Un nouveau dossier annule une purge programmee : sans ca, les
        --   pieces fraiches seraient effacees par le menage de l'ancien.
        pieces_purgees_le = null
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.revendiquer_page(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.revendiquer_page(uuid, text, text, text, text, text, text, text)
  to authenticated;;
