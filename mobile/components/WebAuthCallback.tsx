import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { createSessionFromAuthUrl } from '@/lib/auth/session-from-url';
import { urlHasAuthCallbackParams } from '@/lib/auth/redirect';
import { isWeb } from '@/lib/platform';
import { useTheme } from '@/contexts/ThemeContext';

type VerifyState = 'idle' | 'loading' | 'success' | 'error';

/** Handles Supabase email-verify tokens on the PWA root URL (`/?code=…`). */
export function WebAuthCallback() {
  const { colors } = useTheme();
  const [state, setState] = useState<VerifyState>('idle');
  const [detail, setDetail] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;

    const href = window.location.href;
    if (!urlHasAuthCallbackParams(href)) return;

    setState('loading');

    void createSessionFromAuthUrl(href).then((result) => {
      window.history.replaceState({}, '', '/');

      if (result.ok) {
        setState('success');
        setTimeout(() => {
          setState('idle');
          router.replace('/');
        }, 1200);
        return;
      }

      setDetail(result.error ?? 'Could not verify your account.');
      setState('error');
    });
  }, []);

  if (!isWeb || state === 'idle') return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {state === 'loading' ? (
            <>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Verifying your email…
              </Text>
            </>
          ) : null}

          {state === 'success' ? (
            <>
              <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="checkmark-circle" size={52} color={colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Account verified!</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                You're signed in. Opening Bookmark…
              </Text>
            </>
          ) : null}

          {state === 'error' ? (
            <>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceBorder }]}>
                <Ionicons name="alert-circle-outline" size={52} color={colors.textSecondary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Verification failed</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {detail ?? 'Try signing in — your account may already be verified.'}
              </Text>
              <Pressable
                onPress={() => {
                  setState('idle');
                  router.replace('/account');
                }}
                style={[styles.button, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.buttonText, { color: colors.onAccent }]}>Go to sign in</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
