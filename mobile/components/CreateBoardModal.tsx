import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBoard } from '@/lib/api/boards';
import { uploadBoardCover } from '@/lib/api/storage';
import type { Board } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type CreateBoardModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (board: Board) => void;
};

export function CreateBoardModal({ visible, userId, onClose, onCreated }: CreateBoardModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setCoverUri(null);
    }
  }, [visible]);

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      let coverUrl: string | null = null;
      if (coverUri) {
        coverUrl = await uploadBoardCover(userId, coverUri);
      }
      const board = await createBoard(userId, name, coverUrl);
      onCreated(board);
      onClose();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not create board');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>New board</Text>
          <Pressable
            onPress={pickCover}
            style={[styles.coverPick, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Cover (optional)</Text>
              </>
            )}
          </Pressable>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Board name"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.background },
            ]}
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} disabled={creating}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleCreate} disabled={creating || !name.trim()}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>
                {creating ? 'Creating...' : 'Create'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  coverPick: {
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
});
