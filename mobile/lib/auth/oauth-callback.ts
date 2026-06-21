import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { formatAuthError } from '@/lib/utils/auth';
import { isFirstLogin } from '@/lib/auth/user';

function parseAuthUrl(rawUrl: string): URL {
  if (rawUrl.startsWith('bookmark://')) {
    return new URL(rawUrl.replace('bookmark://', 'https://bookmark.app/'));
  }
  return new URL(rawUrl);
}

function readAuthError(parsed: URL): string | null {
  const queryError =
    parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (queryError) return queryError;

  const hash = parsed.hash.replace(/^#/, '');
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get('error_description') ?? hashParams.get('error');
}

export type OAuthCallbackResult = {
  error: string | null;
  user: User | null;
  isNewUser: boolean;
};

export async function completeOAuthFromUrl(rawUrl: string): Promise<OAuthCallbackResult> {
  try {
    const parsed = parseAuthUrl(rawUrl);
    const authError = readAuthError(parsed);
    if (authError) {
      return { error: formatAuthError(authError), user: null, isNewUser: false };
    }

    const code = parsed.searchParams.get('code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session?.user) {
          const user = existing.session.user;
          return {
            error: null,
            user,
            isNewUser: isFirstLogin(user),
          };
        }
        return { error: formatAuthError(error.message), user: null, isNewUser: false };
      }
      const user = data.user;
      return {
        error: null,
        user,
        isNewUser: user ? isFirstLogin(user) : false,
      };
    }

    const hash = parsed.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        return { error: formatAuthError(error.message), user: null, isNewUser: false };
      }
      const user = data.user;
      return {
        error: null,
        user,
        isNewUser: user ? isFirstLogin(user) : false,
      };
    }

    return { error: 'Invalid sign-in callback', user: null, isNewUser: false };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid sign-in callback',
      user: null,
      isNewUser: false,
    };
  }
}

export function urlHasOAuthCallback(rawUrl: string): boolean {
  try {
    const parsed = parseAuthUrl(rawUrl);
    if (parsed.searchParams.get('code')) return true;
    if (parsed.searchParams.get('error') || parsed.searchParams.get('error_description')) {
      return true;
    }
    const hash = parsed.hash.replace(/^#/, '');
    return hash.includes('access_token=') || hash.includes('error=');
  } catch {
    return rawUrl.includes('code=') || rawUrl.includes('access_token=');
  }
}
