import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PasswordInput } from '@/components/PasswordInput';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  clearPasswordSetupRequired,
  isPasswordSetupRequired,
  wasOAuthNewAccount,
} from '@/lib/auth/password-setup';
import { setOnboardingPending } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase/client';
import { validatePassword } from '@/lib/utils/auth';

export default function SetPasswordScreen() {
  const { user, loading, refreshSession } = useAuth();
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      if (loading || leavingRef.current) return;

      if (!user) {
        leavingRef.current = true;
        router.replace('/account');
        return;
      }

      const required = await isPasswordSetupRequired();
      if (!required) {
        leavingRef.current = true;
        router.replace('/');
        return;
      }

      setReady(true);
    };

    void init();
  }, [user, loading]);

  const handleSubmit = async () => {
    setMessage(null);

    const passwordError = validatePassword(password);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }

    if (password !== passwordConfirm) {
      setMessage('Passwords do not match');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_configured: true },
    });
    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    leavingRef.current = true;
    const isNewAccount = await wasOAuthNewAccount();
    await clearPasswordSetupRequired();
    await refreshSession();

    if (isNewAccount) {
      await setOnboardingPending();
    }

    router.replace('/');
  };

  const canSubmit = Boolean(password && passwordConfirm) && !submitting;

  if (loading || !user || !ready) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name="shield-checkmark-outline" size={40} color={colors.accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Create a password</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your Google account is connected. Set a password so you can also sign in with email.
        </Text>

        {user.email ? (
          <View style={[styles.emailCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={[styles.emailLabel, { color: colors.textSecondary }]}>Account</Text>
            <Text style={[styles.email, { color: colors.text }]}>{user.email}</Text>
          </View>
        ) : null}

        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          autoComplete="new-password"
        />
        <PasswordInput
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          placeholder="Confirm password"
          autoComplete="new-password"
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Min. 8 characters, 1 uppercase, 1 lowercase, 1 number
        </Text>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.accent, opacity: pressed || submitting ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>
            {submitting ? 'Please wait...' : 'Save password and continue'}
          </Text>
        </Pressable>

        {message ? <Text style={[styles.message, { color: colors.danger }]}>{message}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
  emailCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    marginBottom: 4,
  },
  emailLabel: { fontSize: 13 },
  email: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  primaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '600' },
  message: { textAlign: 'center', marginTop: 8, fontSize: 14 },
});
