-- Tattoo board for body art / ink content (Instagram posts, portfolios, etc.)

insert into public.board_catalog (name, group_name, sort_order) values
  ('Tattoo', 'Art', 544)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
