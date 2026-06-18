import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BookmarkCard } from '@/components/BookmarkCard';
import { SearchBar } from '@/components/SearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  deleteBoard,
  fetchBoardBookmarks,
  renameBoard,
} from '@/lib/api/boards';
import { filterBookmarksLocally } from '@/lib/api/bookmarks';
import { supabase } from '@/lib/supabase/client';
import type { Bookmark, BookmarkWithBoard } from '@/lib/supabase/database.types';
import { useBookmarkActions } from '@/hooks/useBookmarkActions';

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const isOnline = useIsOnline();
  const navigation = useNavigation();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [boardName, setBoardName] = useState('Board');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    if (!user || !id) return;

    try {
      const [{ data: board }, items] = await Promise.all([
        supabase.from('boards').select('name').eq('id', id).eq('user_id', user.id).single(),
        fetchBoardBookmarks(id, user.id),
      ]);

      if (board?.name) {
        setBoardName(board.name);
      }

      setBookmarks(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user, id, navigation]);

  const { openDetail, modals } = useBookmarkActions(load);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerBoardName, { color: colors.text }]} numberOfLines={1}>
            {boardName}
          </Text>
          <Text style={[styles.headerLinkCount, { color: colors.textSecondary }]}>
            {bookmarks.length} {bookmarks.length === 1 ? 'link' : 'links'}
          </Text>
        </View>
      ),
      headerRight: () => (
        <Pressable onPress={() => setMenuVisible(true)} style={{ paddingHorizontal: 12 }}>
          <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '600' }}>···</Text>
        </Pressable>
      ),
    });
  }, [navigation, colors, boardName, bookmarks.length]);

  const filtered = useMemo(() => {
    const withBoard = bookmarks.map(
      (b): BookmarkWithBoard => ({ ...b, board: { id: id!, name: boardName } }),
    );
    return filterBookmarksLocally(withBoard, search);
  }, [bookmarks, search, id, boardName]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRenameBoard = async () => {
    if (!user || !id || !renameValue.trim() || !isOnline) return;
    try {
      const board = await renameBoard(id, renameValue, user.id);
      setBoardName(board.name);
      setRenameVisible(false);
      setMenuVisible(false);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not rename board');
    }
  };

  const handleDeleteBoard = () => {
    Alert.alert(
      'Delete board',
      `Delete "${boardName}" and all its links? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user || !id || !isOnline) return;
            try {
              await deleteBoard(id, user.id);
              setMenuVisible(false);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Could not delete board');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search links in this board..."
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {search.trim() ? 'No matches' : 'No links yet'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {search.trim()
              ? 'Try a different search term'
              : 'Share content to this board from any app.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <BookmarkCard
              bookmark={item}
              onPress={() =>
                openDetail({ ...item, board: { id: id!, name: boardName } })
              }
            />
          )}
        />
      )}

      <Modal visible={menuVisible} transparent animationType="fade">
        <Pressable
          style={[styles.menuOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={() => {
                setRenameValue(boardName);
                setRenameVisible(true);
              }}
              style={styles.menuItem}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>Rename board</Text>
            </Pressable>
            <Pressable onPress={handleDeleteBoard} style={styles.menuItem}>
              <Text style={{ color: colors.danger, fontSize: 16 }}>Delete board</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={renameVisible} transparent animationType="fade">
        <View style={[styles.menuOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.renameTitle, { color: colors.text }]}>Rename board</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              style={[
                styles.renameInput,
                {
                  color: colors.text,
                  borderColor: colors.surfaceBorder,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenameVisible(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRenameBoard}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {modals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { alignItems: 'center', maxWidth: 220 },
  headerBoardName: { fontSize: 17, fontWeight: '600' },
  headerLinkCount: { fontSize: 12, marginTop: 2 },
  searchWrap: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  menuOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  menuCard: { borderRadius: 14, padding: 8 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 16 },
  renameCard: { borderRadius: 16, padding: 20, gap: 12 },
  renameTitle: { fontSize: 18, fontWeight: '600' },
  renameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
});
