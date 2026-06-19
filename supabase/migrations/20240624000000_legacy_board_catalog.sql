-- Legacy board names from prior project + English gaps (idempotent upsert)
-- Spanish entries use distinct names from English (e.g. Recetas vs Recipes) so upserts
-- do not clobber existing catalog rows. Same-spelling boards (Ideas, DIY, Gaming, …)
-- already exist in English and are omitted here.

insert into public.board_catalog (name, group_name, sort_order) values
  -- English gaps
  ('Wishlist', 'Lifestyle', 400),
  ('Tools', 'Tech', 401),
  ('Projects', 'Content', 402),
  ('Research', 'Content', 403),
  ('Courses', 'Content', 404),
  ('Gifts', 'Lifestyle', 405),
  ('Family', 'Lifestyle', 406),
  ('Technology', 'Tech', 407),
  ('Reading', 'Content', 408),
  ('Work', 'Finance', 409),
  ('Video', 'Content', 410),
  ('Personal', 'Lifestyle', 411),

  -- Spanish (legacy project)
  ('Eventos', 'Español', 500),
  ('Herramientas', 'Español', 502),
  ('Inspiración', 'Español', 503),
  ('Arte', 'Español', 504),
  ('Compras', 'Español', 505),
  ('Tecnología', 'Español', 506),
  ('Proyectos', 'Español', 508),
  ('Productividad', 'Español', 509),
  ('Hogar', 'Español', 510),
  ('Idiomas', 'Español', 511),
  ('Noticias', 'Español', 512),
  ('Salud', 'Español', 513),
  ('Libros', 'Español', 514),
  ('Cine y series', 'Español', 515),
  ('Belleza', 'Español', 516),
  ('Decoración', 'Español', 517),
  ('Música', 'Español', 518),
  ('Restaurantes', 'Español', 519),
  ('Investigación', 'Español', 520),
  ('Trabajo', 'Español', 521),
  ('Recetas', 'Español', 522),
  ('Fotografía', 'Español', 524),
  ('Negocios', 'Español', 525),
  ('Vídeo', 'Español', 526),
  ('Finanzas', 'Español', 527),
  ('Lecturas', 'Español', 528),
  ('Diseño', 'Español', 529),
  ('Viajes', 'Español', 530),
  ('Emprendimiento', 'Español', 531),
  ('Moda', 'Español', 532),
  ('Deporte', 'Español', 533),
  ('Educación', 'Español', 534),
  ('Tutoriales', 'Español', 535),
  ('Familia', 'Español', 536),
  ('Cursos', 'Español', 537),
  ('Entretenimiento', 'Español', 538),
  ('Regalos', 'Español', 539),
  ('Inversión', 'Español', 540),
  ('IA', 'Español', 541)
on conflict (name) do update set
  group_name = excluded.group_name,
  sort_order = excluded.sort_order,
  active = true;
