import { supabase } from '@/lib/supabase/client';

function parseAuthUrl(rawUrl: string): URL {
  if (rawUrl.startsWith('bookmark://')) {
    return new URL(rawUrl.replace('bookmark://', 'https://bookmark.app/'));
  }
  return new URL(rawUrl);
}

/** Exchange Supabase email-confirm / magic-link params for a session. */
export async function createSessionFromAuthUrl(rawUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = parseAuthUrl(rawUrl);
    const code = parsed.searchParams.get('code');

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    const hash = parsed.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    return { ok: false, error: 'Missing auth tokens in link' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid link' };
  }
}
