-- Allow caching Groq classifications alongside Gemini and heuristics

alter table public.link_classification_cache
  drop constraint if exists link_classification_cache_source_check;

alter table public.link_classification_cache
  add constraint link_classification_cache_source_check
  check (source in ('gemini', 'groq', 'heuristic'));
