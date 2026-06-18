import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type SearchBarProps = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

export function SearchBar({ value, onChangeText, ...props }: SearchBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <Text style={[styles.icon, { color: colors.textMuted }]}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search boards..."
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
});
