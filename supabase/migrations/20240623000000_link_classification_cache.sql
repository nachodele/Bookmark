-- Global classification cache: normalized URL → board + title + description
-- Shared across users to skip repeat Gemini calls for the same link.

create table if not exists public.link_classification_cache (
  url_hash text primary key,
  url text not null,
  board_name text not null,
  title text not null,
  description text not null,
  source text not null check (source in ('gemini', 'heuristic')),
  cache_version int not null default 1,
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 days')
);

create index if not exists link_classification_cache_expires_idx
  on public.link_classification_cache (expires_at);

create index if not exists link_classification_cache_version_idx
  on public.link_classification_cache (cache_version, expires_at);

alter table public.link_classification_cache enable row level security;

-- Authenticated users may read non-expired entries (edge function writes via service role)
create policy "Authenticated users can read active classification cache"
  on public.link_classification_cache
  for select
  to authenticated
  using (expires_at > now());

create or replace function public.increment_classification_cache_hit(p_url_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.link_classification_cache
  set hit_count = hit_count + 1
  where url_hash = p_url_hash and expires_at > now();
end;
$$;

revoke all on function public.increment_classification_cache_hit(text) from public;
grant execute on function public.increment_classification_cache_hit(text) to service_role;
