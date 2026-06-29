-- Allow a bookmark to appear in multiple boards (in addition to its primary board_id).
-- The primary board_id on bookmarks is kept as the "home" board.
-- Additional boards are tracked here.

create table public.bookmark_board_memberships (
  bookmark_id uuid        not null references public.bookmarks(id) on delete cascade,
  board_id    uuid        not null references public.boards(id)    on delete cascade,
  user_id     uuid        not null,
  created_at  timestamptz not null default now(),
  primary key (bookmark_id, board_id)
);

alter table public.bookmark_board_memberships enable row level security;

create policy "Users manage own memberships"
  on public.bookmark_board_memberships
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index bookmark_board_memberships_board_idx
  on public.bookmark_board_memberships (board_id);
