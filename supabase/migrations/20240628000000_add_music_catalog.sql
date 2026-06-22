-- Umbrella Music board (genre boards like Rock, Pop already exist under group Music)
insert into public.board_catalog (name, group_name, sort_order) values
  ('Music', 'Music', 29)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
