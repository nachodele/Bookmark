-- Master board catalog: predefined categories the AI can assign (users only see boards they use)

create table if not exists public.board_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text not null default 'General',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint board_catalog_name_unique unique (name)
);

create index if not exists board_catalog_active_sort_idx
  on public.board_catalog (active, sort_order, name);

alter table public.board_catalog enable row level security;

-- Any signed-in user can read the catalog (edge function uses the user's JWT)
create policy "Authenticated users can read board catalog"
  on public.board_catalog
  for select
  to authenticated
  using (active = true);

-- Seed catalog (idempotent)
insert into public.board_catalog (name, group_name, sort_order) values
  ('Football', 'Sports', 10),
  ('Basketball', 'Sports', 11),
  ('Tennis', 'Sports', 12),
  ('Formula 1', 'Sports', 13),
  ('MMA', 'Sports', 14),
  ('Boxing', 'Sports', 15),
  ('Rugby', 'Sports', 16),
  ('Cricket', 'Sports', 17),
  ('Golf', 'Sports', 18),
  ('Cycling', 'Sports', 19),
  ('Volleyball', 'Sports', 20),
  ('Baseball', 'Sports', 21),
  ('Hockey', 'Sports', 22),
  ('Winter Sports', 'Sports', 23),
  ('Swimming', 'Sports', 24),
  ('Hip-Hop', 'Music', 30),
  ('Techno', 'Music', 31),
  ('House', 'Music', 32),
  ('Jazz', 'Music', 33),
  ('Rock', 'Music', 34),
  ('Pop', 'Music', 35),
  ('R&B', 'Music', 36),
  ('Classical', 'Music', 37),
  ('Electronic', 'Music', 38),
  ('Latin', 'Music', 39),
  ('Folk', 'Music', 40),
  ('Fashion', 'Lifestyle', 50),
  ('Beauty', 'Lifestyle', 51),
  ('Shopping', 'Lifestyle', 52),
  ('Home', 'Lifestyle', 53),
  ('Fitness', 'Lifestyle', 54),
  ('Travel', 'Lifestyle', 55),
  ('Recipes', 'Content', 60),
  ('Design', 'Content', 61),
  ('Programming', 'Content', 62),
  ('Business', 'Content', 63),
  ('Art', 'Content', 64),
  ('Inspiration', 'Content', 65),
  ('Ideas', 'Content', 66),
  ('Film', 'Content', 67),
  ('Gaming', 'Content', 68),
  ('Books', 'Content', 69),
  ('News', 'Content', 70),
  ('Science', 'Content', 71),
  ('Health', 'Content', 72)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
