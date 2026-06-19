import { StyleSheet, View, Platform, type ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export function Screen({ style, children, ...props }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background },
        Platform.OS === 'web' && styles.webShell,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  webShell: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
});
