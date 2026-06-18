import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type InfoModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function InfoModal({ visible, title, onClose, children }: InfoModalProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[styles.close, { color: colors.accent }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 16, fontWeight: '600' },
  body: { padding: 20, paddingBottom: 40 },
});
