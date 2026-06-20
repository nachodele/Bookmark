-- Security hardening (Supabase linter)
-- 1. Public bucket board-covers: drop broad SELECT policy (listing).
--    Public URLs still work via bucket public flag + getPublicUrl().
-- 2. increment_classification_cache_hit: only service_role may execute (edge function).

drop policy if exists "Board covers are publicly readable" on storage.objects;

revoke execute on function public.increment_classification_cache_hit(text) from public;
revoke execute on function public.increment_classification_cache_hit(text) from anon;
revoke execute on function public.increment_classification_cache_hit(text) from authenticated;
grant execute on function public.increment_classification_cache_hit(text) to service_role;
