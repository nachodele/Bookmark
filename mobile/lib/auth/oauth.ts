import * as WebBrowser from 'expo-web-browser';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { formatAuthError } from '@/lib/utils/auth';
import { getOAuthRedirectUrl } from '@/lib/auth/redirect';
import { completeOAuthFromUrl, type OAuthCallbackResult } from '@/lib/auth/oauth-callback';
import { isWeb } from '@/lib/platform';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'apple';

const PROVIDER_MAP: Record<OAuthProvider, Provider> = {
  google: 'google',
  apple: 'apple',
};

function providerOptions(provider: OAuthProvider) {
  if (provider === 'apple') {
    return { queryParams: { scope: 'email name' } };
  }
  return {};
}

export type OAuthSignInResult = OAuthCallbackResult & {
  cancelled?: boolean;
};

export async function signInWithOAuthProvider(provider: OAuthProvider): Promise<OAuthSignInResult> {
  const redirectTo = getOAuthRedirectUrl();

  if (isWeb) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: PROVIDER_MAP[provider],
      options: {
        redirectTo,
        ...providerOptions(provider),
      },
    });
    if (error) {
      return { error: formatAuthError(error.message), user: null, isNewUser: false };
    }
    return { error: null, user: null, isNewUser: false };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: PROVIDER_MAP[provider],
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...providerOptions(provider),
    },
  });

  if (error) {
    return { error: formatAuthError(error.message), user: null, isNewUser: false };
  }
  if (!data.url) {
    return { error: 'Could not start sign in', user: null, isNewUser: false };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: null, user: null, isNewUser: false, cancelled: true };
  }

  if (result.type !== 'success') {
    return { error: 'Sign in was cancelled', user: null, isNewUser: false };
  }

  return completeOAuthFromUrl(result.url);
}
