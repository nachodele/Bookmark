import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { isWeb } from '@/lib/platform';

/** Visible back chevron on PWA — native header back can inherit an invisible tint. */
export function WebHeaderBack() {
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();

  if (!isWeb || !navigation.canGoBack()) return null;

  return (
    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.btn}>
      <Ionicons name="chevron-back" size={28} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 4, marginLeft: -4 },
});
