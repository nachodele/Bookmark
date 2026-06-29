import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { formatAuthError } from '@/lib/utils/auth';
import { getAuthRedirectUrl } from '@/lib/auth/redirect';
import { clearPasswordSetupRequired } from '@/lib/auth/password-setup';
import { signInWithOAuthProvider, type OAuthProvider, type OAuthSignInResult } from '@/lib/auth/oauth';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    consent?: { policyVersion: number },
  ) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<OAuthSignInResult>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.session) {
      setSession(data.session);
    }
    return { error: error ? formatAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    consent?: { policyVersion: number },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        // Record privacy-policy consent on the auth user (audit trail without a separate table).
        data: consent
          ? {
              privacy_policy_version: consent.policyVersion,
              privacy_accepted_at: new Date().toISOString(),
              data_commercialization_consent: true,
            }
          : undefined,
      },
    });

    if (error) {
      return { error: formatAuthError(error.message) };
    }

    // Supabase may return success with no identities when email already exists
    if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
      return { error: 'Email already in use' };
    }

    if (data.session) {
      setSession(data.session);
    }

    return { error: null };
  }, []);

  const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
    const result = await signInWithOAuthProvider(provider);
    if (result.user) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
      }
    }
    return result;
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) {
      setSession(data.session);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!error && userData.user && sessionData.session) {
      setSession({ ...sessionData.session, user: userData.user });
    } else if (sessionData.session) {
      setSession(sessionData.session);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem('pending_share');
    await clearPasswordSetupRequired();
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signInWithOAuth,
      refreshSession,
      signOut,
    }),
    [session, loading, signIn, signUp, signInWithOAuth, refreshSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
