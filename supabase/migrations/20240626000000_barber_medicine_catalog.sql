-- Barber Shop + Medicine catalog entries

insert into public.board_catalog (name, group_name, sort_order) values
  ('Barber Shop', 'Lifestyle', 542),
  ('Medicine', 'Health', 543)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
