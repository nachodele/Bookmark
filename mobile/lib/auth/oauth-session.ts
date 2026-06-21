import { supabase } from '@/lib/supabase/client';
import { completeOAuthFromUrl, urlHasOAuthCallback } from '@/lib/auth/oauth-callback';
import { finishOAuthSignIn } from '@/lib/auth/oauth-flow';
import { isWeb } from '@/lib/platform';

const WEB_HANDLED_CODE_KEY = 'bookmark_oauth_code_handled';

let inflightResolve: Promise<OAuthResolveResult> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCodeFromUrl(href: string): string | null {
  try {
    const parsed = new URL(href.replace(/^bookmark:\/\//, 'https://bookmark.app/'));
    return parsed.searchParams.get('code');
  } catch {
    return null;
  }
}

function isCodeAlreadyHandled(href: string): boolean {
  if (!isWeb || typeof window === 'undefined') return false;
  const code = getCodeFromUrl(href);
  return Boolean(code && sessionStorage.getItem(WEB_HANDLED_CODE_KEY) === code);
}

function markWebCodeHandled(href: string): void {
  if (!isWeb || typeof window === 'undefined') return;
  const code = getCodeFromUrl(href);
  if (code) sessionStorage.setItem(WEB_HANDLED_CODE_KEY, code);
}

function cleanWebCallbackUrl(): void {
  if (isWeb && typeof window !== 'undefined') {
    window.history.replaceState({}, '', '/auth/callback');
  }
}

async function finishFromExistingSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return false;
  await finishOAuthSignIn(data.session.user);
  return true;
}

export type OAuthResolveResult = { ok: true } | { ok: false; error: string };

async function resolveOAuthCallbackInner(href: string | null): Promise<OAuthResolveResult> {
  const hasCallback = Boolean(href && urlHasOAuthCallback(href));
  const code = href ? getCodeFromUrl(href) : null;

  if (!hasCallback) {
    if (await finishFromExistingSession()) {
      return { ok: true };
    }
    await sleep(400);
    if (await finishFromExistingSession()) {
      return { ok: true };
    }
    return { ok: false, error: 'This sign-in link is invalid or has expired.' };
  }

  if (isCodeAlreadyHandled(href!)) {
    if (await finishFromExistingSession()) {
      cleanWebCallbackUrl();
      return { ok: true };
    }
  }

  if (isWeb && code) {
    sessionStorage.setItem(WEB_HANDLED_CODE_KEY, code);
  }

  const result = await completeOAuthFromUrl(href!);

  if (isWeb && typeof window !== 'undefined') {
    cleanWebCallbackUrl();
  }

  if (result.error) {
    if (await finishFromExistingSession()) {
      return { ok: true };
    }
    await sleep(400);
    if (await finishFromExistingSession()) {
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }

  await finishOAuthSignIn(result.user);
  return { ok: true };
}

export async function resolveOAuthCallback(href: string | null): Promise<OAuthResolveResult> {
  if (!inflightResolve) {
    inflightResolve = resolveOAuthCallbackInner(href).finally(() => {
      inflightResolve = null;
    });
  }
  return inflightResolve;
}
