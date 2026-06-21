import type { User } from '@supabase/supabase-js';
import { isPasswordSetupRequired } from '@/lib/auth/password-setup';

/** True when the account was just created (first OAuth or immediate sign-in). */
export function isFirstLogin(user: User): boolean {
  const created = new Date(user.created_at).getTime();
  const lastSignIn = new Date(user.last_sign_in_at ?? user.created_at).getTime();
  return Math.abs(lastSignIn - created) < 60_000;
}

export function hasConfiguredPassword(user: User): boolean {
  return user.user_metadata?.password_configured === true;
}

/** Password screen only for brand-new OAuth accounts or incomplete setup. */
export async function shouldRequirePasswordSetup(user: User): Promise<boolean> {
  if (hasConfiguredPassword(user)) return false;
  if (await isPasswordSetupRequired()) return true;
  return isFirstLogin(user);
}
