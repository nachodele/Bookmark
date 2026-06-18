import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
          <Pressable onPress={onClose} style={styles.backButton} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
            <Text style={[styles.backLabel, { color: colors.accent }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backLabel: { fontSize: 17, fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '700', paddingHorizontal: 4 },
  body: { padding: 20, paddingBottom: 32 },
});
