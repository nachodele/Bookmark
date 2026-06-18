import { StyleSheet, Text, View } from 'react-native';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';

export function OfflineBanner() {
  const { colors } = useTheme();
  const isOnline = useIsOnline();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.accentMuted }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        Offline — showing cached boards. Saving is disabled.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
