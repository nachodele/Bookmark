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
 * Email confirmation opens a static page in the browser — no app load, no auto sign-in.
 * Add this URL to Supabase → Authentication → Redirect URLs.
 */
export function getAuthRedirectUrl(): string {
  if (isWeb && typeof window !== 'undefined') {
    return `${window.location.origin}/verified.html`;
  }
  return `${getWebAppUrl()}/verified.html`;
}

/** OAuth (Google / Apple) returns here — PWA route or native deep link. */
export function getOAuthRedirectUrl(): string {
  if (isWeb && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return Linking.createURL('auth/callback');
}
