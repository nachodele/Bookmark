-- Bookmark App schema: boards + bookmarks with RLS

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cover_url text,
  created_at timestamptz default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  title text,
  description text,
  source_app text,
  thumbnail_url text,
  created_at timestamptz default now(),
  unique (user_id, url)
);

create index if not exists boards_user_id_idx on public.boards (user_id);
create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id);
create index if not exists bookmarks_board_id_idx on public.bookmarks (board_id);

alter table public.boards enable row level security;
alter table public.bookmarks enable row level security;

create policy "Users manage own boards"
  on public.boards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own bookmarks"
  on public.bookmarks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
