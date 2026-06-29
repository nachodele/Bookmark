-- Phase 0 — "Mother table" enrichment.
-- Make public.bookmarks the rich central resource/fact table for future model training.
-- All changes are ADDITIVE (nullable / defaulted) so existing app code keeps working.
-- board_catalog (taxonomy) and link_classification_cache (cross-user cache) stay separate
-- by design; a denormalized training VIEW flattens everything for ML export.

-- pgvector for embeddings (semantic search + training features).
create extension if not exists vector with schema extensions;

alter table public.bookmarks
  -- Classification provenance (the gold training signal: AI pick vs final user choice)
  add column if not exists ai_category        text,        -- category the AI originally proposed
  add column if not exists final_category     text,        -- category actually saved (denormalized board name)
  add column if not exists category_source    text,        -- 'groq' | 'gemini' | 'heuristic' | 'user'
  add column if not exists category_confidence real,
  add column if not exists was_recategorized  boolean not null default false, -- user overrode the AI
  add column if not exists model_version       integer,
  add column if not exists alt_categories      jsonb,       -- runner-up categories + scores

  -- Content / extraction metadata
  add column if not exists resource_type   text,            -- article|video|image|pdf|post|product|other
  add column if not exists domain          text,            -- host of url
  add column if not exists author          text,
  add column if not exists published_at    timestamptz,
  add column if not exists lang            text,
  add column if not exists word_count      integer,
  add column if not exists content_excerpt text,
  add column if not exists transcript      text,            -- video/audio transcript
  add column if not exists image_caption   text,            -- vision-generated caption
  add column if not exists dominant_colors text[],          -- palette for moodboard/visual nooks
  add column if not exists keywords        text[] not null default '{}',

  -- Behavioral signals (training labels + retention features)
  add column if not exists is_favorite     boolean not null default false,
  add column if not exists open_count      integer not null default 0,
  add column if not exists last_opened_at  timestamptz,
  add column if not exists in_review_inbox boolean not null default false,

  -- Embeddings + housekeeping
  add column if not exists embedding   extensions.vector(768),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists deleted_at  timestamptz;          -- soft delete

-- Analytics / filter indexes (small table today; cheap and future-proof)
create index if not exists bookmarks_domain_idx          on public.bookmarks (domain);
create index if not exists bookmarks_resource_type_idx   on public.bookmarks (resource_type);
create index if not exists bookmarks_final_category_idx  on public.bookmarks (final_category);
create index if not exists bookmarks_review_inbox_idx    on public.bookmarks (in_review_inbox) where in_review_inbox;
create index if not exists bookmarks_not_deleted_idx     on public.bookmarks (user_id) where deleted_at is null;
-- NOTE: ivfflat/hnsw embedding index intentionally deferred until there is enough
-- row volume to pick list/m parameters sensibly (ivfflat needs data to train).

-- keep updated_at fresh (search_path pinned per Supabase security linter)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookmarks_touch_updated_at on public.bookmarks;
create trigger bookmarks_touch_updated_at
  before update on public.bookmarks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Denormalized training view: one wide row per resource, taxonomy joined in.
-- security_invoker => RLS on bookmarks still applies (each user sees only theirs).
-- ---------------------------------------------------------------------------
create or replace view public.resource_training_view
with (security_invoker = true) as
select
  b.id,
  b.user_id,
  b.url,
  b.domain,
  b.source_app,
  b.resource_type,
  b.title,
  b.description,
  b.content_excerpt,
  b.author,
  b.lang,
  b.word_count,
  b.keywords,
  b.final_category,
  cat.group_name              as category_group,
  b.ai_category,
  b.was_recategorized,        -- TRUE rows = supervised correction pairs (ai_category -> final_category)
  b.category_source,
  b.category_confidence,
  b.is_favorite,
  b.open_count,
  b.last_opened_at,
  b.created_at,
  b.published_at
from public.bookmarks b
left join public.board_catalog cat
  on lower(cat.name) = lower(b.final_category)
where b.deleted_at is null;
