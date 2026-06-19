import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createBoard, fetchBoards, filterBoardsByName } from '@/lib/api/boards';
import { uploadBoardCover } from '@/lib/api/storage';
import type { BoardWithCount } from '@/lib/supabase/database.types';
import { BoardCard } from '@/components/BoardCard';
import { InfoModal } from '@/components/InfoModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getGuideSteps, GUIDE } from '@/lib/content/info';
import { isWeb } from '@/lib/platform';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const CACHE_KEY = 'boards_cache';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const isOnline = useIsOnline();
  const [boards, setBoards] = useState<BoardWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      if (isOnline) {
        const boardData = await fetchBoards(user.id);
        setBoards(boardData);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(boardData));
      } else {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setBoards(JSON.parse(cached) as BoardWithCount[]);
      }
    } catch (error) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) setBoards(JSON.parse(cached) as BoardWithCount[]);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user, isOnline]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const filteredBoards = useMemo(
    () => filterBoardsByName(boards, search),
    [boards, search],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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

  const closeModal = () => {
    setModalVisible(false);
    setNewBoardName('');
    setCoverUri(null);
  };

  const handleCreateBoard = async () => {
    if (!user || !newBoardName.trim()) return;
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to the internet to create a board.');
      return;
    }

    setCreating(true);
    try {
      let coverUrl: string | null = null;
      if (coverUri) {
        coverUrl = await uploadBoardCover(user.id, coverUri);
      }
      await createBoard(user.id, newBoardName, coverUrl);
      closeModal();
      await load();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not create board');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.greeting, { color: colors.text }]}>Your boards</Text>
          <Pressable
            onPress={() => setGuideVisible(true)}
            style={({ pressed }) => [styles.guideButton, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="How to use Bookmark"
          >
            <Text style={styles.guideEmoji}>📖</Text>
            <Text style={[styles.guideLabel, { color: colors.accent }]}>How to use</Text>
          </Pressable>
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search boards..." />
      </View>

      <FlatList
        data={filteredBoards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {search.trim() ? 'No boards match' : 'Your boards will appear here'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search.trim()
                ? 'Try a different search term'
                : isWeb
                  ? 'Save a link from the Save tab — AI creates the right board automatically.'
                  : 'Share a link from any app — AI creates the right board automatically.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BoardCard board={item} onPress={() => router.push(`/board/${item.id}`)} />
        )}
      />

      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New board</Text>
            <Pressable
              onPress={pickCover}
              style={[styles.coverPick, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}
            >
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverPreview} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Add cover image</Text>
                </>
              )}
            </Pressable>
            <TextInput
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  borderColor: colors.surfaceBorder,
                  backgroundColor: colors.background,
                },
              ]}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeModal}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleCreateBoard} disabled={creating || !newBoardName.trim()}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>
                  {creating ? 'Creating...' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <InfoModal visible={guideVisible} title={GUIDE.title} onClose={() => setGuideVisible(false)}>
        <Text style={[styles.guideIntro, { color: colors.textSecondary }]}>{GUIDE.intro}</Text>
        {getGuideSteps(isWeb).map((step) => (
          <View key={step.title} style={styles.guideStep}>
            <Text style={[styles.guideStepTitle, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.guideStepBody, { color: colors.textSecondary }]}>{step.body}</Text>
          </View>
        ))}
      </InfoModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, paddingBottom: 8, gap: 12 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  greeting: { fontSize: 28, fontWeight: '700', flex: 1 },
  guideButton: { alignItems: 'center', paddingTop: 2, minWidth: 72 },
  guideEmoji: { fontSize: 26, lineHeight: 32 },
  guideLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  guideIntro: { fontSize: 15, lineHeight: 24, marginBottom: 16 },
  guideStep: { marginBottom: 20, gap: 6 },
  guideStepTitle: { fontSize: 16, fontWeight: '600' },
  guideStepBody: { fontSize: 15, lineHeight: 22 },
  grid: { paddingHorizontal: 10, paddingBottom: 100 },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 20, padding: 20, gap: 14 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  coverPick: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: '100%' },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
});
