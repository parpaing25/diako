-- ============================================================================
-- 0022 — MON CARNET : garder une ADRESSE, et retrouver ce qu'on a aimé
--
-- `saves` ne connaît que les publications. Or en préparant un voyage, ce qu'on
-- garde n'est pas un récit : c'est l'hôtel où on pense dormir. Sans cette
-- table, un voyageur qui trouve trois adresses à Majunga doit les noter
-- ailleurs — et il ne revient pas.
--
-- Et ce qu'un lecteur laisse le plus souvent derrière lui n'est pas un
-- enregistrement, c'est un cœur : `mes_publications_aimees` remonte les
-- réactions, qui étaient jusqu'ici écrites en base sans jamais être relues.
-- ============================================================================

create table if not exists public.page_saves (
  page_id    uuid not null references public.pages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create index if not exists page_saves_user_idx on public.page_saves(user_id, created_at desc);
alter table public.page_saves enable row level security;

drop policy if exists page_saves_moi on public.page_saves;
create policy page_saves_moi on public.page_saves for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.page_saves from anon;

-- Tout ce qu'il faut pour afficher le carnet, en UN appel.
create or replace function public.mes_etablissements_gardes(p_limite integer default 50)
returns table (
  id uuid, slug text, name text, categories text[], short_desc text,
  cover_url text, place_name text, landmark text, phone text,
  price_min_ar bigint, price_min_unit text, rating_avg numeric, rating_count integer,
  garde_le timestamptz, note text)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.categories, p.short_desc, p.cover_url,
         pl.name_fr, p.landmark, p.phone,
         p.price_min_ar, p.price_min_unit, p.rating_avg, p.rating_count,
         s.created_at, s.note
    from public.page_saves s
    join public.pages p on p.id = s.page_id and p.is_published
    left join public.places pl on pl.id = p.place_id
   where s.user_id = (select auth.uid())
   order by s.created_at desc
   limit least(greatest(coalesce(p_limite, 50), 1), 100)
$$;

create or replace function public.mes_publications_aimees(p_limite integer default 50)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(s.j order by s.aime_le desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', po.id, 'body', po.body, 'media', po.media, 'place', po.place,
             'created_at', po.created_at, 'aime_le', r.created_at,
             'reactions_count', po.reactions_count, 'comments_count', po.comments_count,
             'auteur', jsonb_build_object('id', pr.id, 'nom', pr.display_name, 'avatar', pr.avatar_url)
           ) as j,
           r.created_at as aime_le
      from public.reactions r
      join public.posts po on po.id = r.post_id and po.status = 'published'
      left join public.profiles pr on pr.id = po.author_id
     where r.user_id = (select auth.uid())
     order by r.created_at desc
     limit least(greatest(coalesce(p_limite, 50), 1), 100)
  ) s
$$;

revoke execute on function public.mes_etablissements_gardes(integer) from public, anon, authenticated;
revoke execute on function public.mes_publications_aimees(integer)   from public, anon, authenticated;
grant  execute on function public.mes_etablissements_gardes(integer) to authenticated;
grant  execute on function public.mes_publications_aimees(integer)   to authenticated;
