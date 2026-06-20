import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PasswordInput } from '@/components/PasswordInput';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import { validatePasswordChange } from '@/lib/utils/auth';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!user?.email) return;

    const validationError = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (validationError) {
      Alert.alert('Invalid password', validationError);
      return;
    }

    setChangingPassword(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setChangingPassword(false);
      Alert.alert('Incorrect password', 'Your current password is wrong.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      Alert.alert('Could not update password', error.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Your password has been changed.');
  };

  const canSubmit =
    Boolean(currentPassword && newPassword && confirmPassword) && !changingPassword;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
          <View style={styles.themeRow}>
            {(['light', 'dark'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setMode(option)}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: mode === option ? colors.accent : colors.surface,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
              >
                <Ionicons
                  name={option === 'dark' ? 'moon' : 'sunny'}
                  size={18}
                  color={mode === option ? colors.onAccent : colors.text}
                />
                <Text
                  style={{
                    color: mode === option ? colors.onAccent : colors.text,
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          {user ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[styles.email, { color: colors.text }]}>{user.email}</Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CHANGE PASSWORD</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, gap: 12 }]}>
                <PasswordInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  autoComplete="current-password"
                />
                <PasswordInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  autoComplete="new-password"
                />
                <PasswordInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  Min. 8 characters, 1 uppercase, 1 lowercase, 1 number
                </Text>
                <Pressable
                  onPress={handleChangePassword}
                  disabled={!canSubmit}
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.accent, opacity: changingPassword ? 0.7 : 1 },
                  ]}
                >
                  {changingPassword ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>Update password</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginBottom: 4 },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  label: { fontSize: 13, marginBottom: 4 },
  email: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
});
