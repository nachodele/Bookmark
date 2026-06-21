import type { User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import {
  clearPasswordSetupRequired,
  markPasswordSetupRequired,
} from '@/lib/auth/password-setup';
import { isFirstLogin, shouldRequirePasswordSetup } from '@/lib/auth/user';

export async function finishOAuthSignIn(user: User | null): Promise<void> {
  if (!user) {
    router.replace('/account');
    return;
  }

  if (await shouldRequirePasswordSetup(user)) {
    await markPasswordSetupRequired(isFirstLogin(user));
    router.replace('/set-password');
    return;
  }

  await clearPasswordSetupRequired();
  router.replace('/');
}
