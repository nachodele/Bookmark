-- Fix Supabase Security Advisor warnings for rls_auto_enable().
--
-- This function is an EVENT TRIGGER helper from Supabase docs that auto-enables
-- RLS on new tables. It should NOT be callable via PostgREST (/rest/v1/rpc/...).
-- Revoking EXECUTE from API roles does not break the event trigger itself.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
