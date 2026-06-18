import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type PasswordInputProps = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

export function PasswordInput({ value, onChangeText, style, ...props }: PasswordInputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: colors.surfaceBorder,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        style={[styles.input, { color: colors.text }, style]}
        {...props}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Text style={[styles.toggleText, { color: colors.accent }]}>
          {visible ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
