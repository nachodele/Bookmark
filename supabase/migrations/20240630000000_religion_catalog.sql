-- Religion board for faith, prayer, and spiritual content

insert into public.board_catalog (name, group_name, sort_order) values
  ('Religion', 'Lifestyle', 151)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
