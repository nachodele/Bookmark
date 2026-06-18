import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export function Screen({ style, children, ...props }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
