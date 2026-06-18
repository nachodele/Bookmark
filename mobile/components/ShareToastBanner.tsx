import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { ShareToast } from '@/hooks/useShareHandler';

type ShareToastBannerProps = {
  toast: ShareToast | null;
};

export function ShareToastBanner({ toast }: ShareToastBannerProps) {
  const { colors } = useTheme();

  if (!toast) return null;

  const background =
    toast.type === 'success' ? colors.success : colors.danger;

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <Text style={styles.text}>{toast.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
