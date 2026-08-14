-- ============================================================================
-- 0015 — MÉMOIRE ET LIMITE DE DÉBIT DE L'AGENT DIAKO
--
-- Transcrit du projet frère, avec sa leçon principale :
--
-- ⚠ UNE LIMITE DE DÉBIT GARDÉE EN MÉMOIRE DANS L'EDGE FUNCTION NE SE
--   DÉCLENCHE JAMAIS. Chaque appel peut atterrir sur une instance neuve, dont
--   le compteur repart à zéro. La limite doit être comptée EN BASE, par minute
--   et par clé. C'est un défaut réellement constaté sur Fonenako, où la
--   protection existait dans le code et ne protégeait rien.
--
-- La mémoire porte le contexte d'une conversation : « et à Majunga ? » doit
-- hériter de la catégorie cherchée juste avant. AUCUNE policy : seul le
-- service role (l'edge function) lit et écrit. Un utilisateur ne doit pas
-- pouvoir lire la mémoire d'un autre, et il n'a aucune raison de lire la
-- sienne autrement que par l'agent.
-- ============================================================================

create table if not exists public.agent_memories (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from anon, authenticated;

create table if not exists public.agent_rate (
  cle    text        not null,
  minute timestamptz not null,
  n      int         not null default 0,
  primary key (cle, minute)
);
alter table public.agent_rate enable row level security;
revoke all on public.agent_rate from anon, authenticated;

create or replace function public.agent_rate_hit(p_cle text, p_max int default 20)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_min timestamptz := date_trunc('minute', now()); v_n int;
begin
  insert into public.agent_rate (cle, minute, n)
  values (left(coalesce(p_cle, 'anon'), 120), v_min, 1)
  on conflict (cle, minute) do update set n = agent_rate.n + 1
  returning n into v_n;
  -- Purge au fil de l'eau : la table ne doit pas grossir indéfiniment, et une
  -- tâche planifiée serait une pièce mobile de plus à surveiller.
  delete from public.agent_rate where minute < now() - interval '10 minutes';
  return v_n <= greatest(1, p_max);
end $$;

revoke execute on function public.agent_rate_hit(text, int) from public, anon, authenticated;
