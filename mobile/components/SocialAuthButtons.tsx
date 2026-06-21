import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { OAuthProvider } from '@/lib/auth/oauth';

type SocialAuthButtonsProps = {
  disabled?: boolean;
  onPress: (provider: OAuthProvider) => void;
};

export function SocialAuthButtons({ disabled, onPress }: SocialAuthButtonsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.surfaceBorder }]} />
        <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.surfaceBorder }]} />
      </View>

      <Pressable
        onPress={() => onPress('google')}
        disabled={disabled}
        style={({ pressed }) => [
          styles.socialButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.surfaceBorder,
            opacity: pressed || disabled ? 0.75 : 1,
          },
        ]}
      >
        <Ionicons name="logo-google" size={20} color={colors.text} />
        <Text style={[styles.socialLabel, { color: colors.text }]}>Continue with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
  },
  socialLabel: { fontSize: 15, fontWeight: '600' },
});
