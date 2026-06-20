import * as Linking from 'expo-linking';
import { isWeb } from '@/lib/platform';

const DEFAULT_WEB_URL = 'https://bookmark-bxm.pages.dev';

/** Public PWA origin (no trailing slash). */
export function getWebAppUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (isWeb && typeof window !== 'undefined') return window.location.origin;
  return DEFAULT_WEB_URL;
}

/**
 * Email confirmation links open in the browser — always use the live PWA root `/`.
 * Static hosting serves a single index.html; deep paths like /auth/callback 404 on Pages.
 */
export function getAuthRedirectUrl(): string {
  if (isWeb && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  return `${getWebAppUrl()}/`;
}

/** Deep link when the installed app handles auth (optional). */
export function getNativeAuthRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

export function urlHasAuthCallbackParams(href: string): boolean {
  try {
    const parsed = new URL(href.replace(/^bookmark:\/\//, 'https://bookmark.app/'));
    if (parsed.searchParams.get('code')) return true;
    if (parsed.searchParams.get('error')) return true;
    if (parsed.searchParams.get('error_description')) return true;
    const hash = parsed.hash.replace(/^#/, '');
    return hash.includes('access_token=') || hash.includes('type=signup') || hash.includes('type=email');
  } catch {
    return href.includes('code=') || href.includes('access_token=');
  }
}
