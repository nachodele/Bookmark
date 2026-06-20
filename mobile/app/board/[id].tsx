import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AddLinkModal } from '@/components/AddLinkModal';
import { BookmarkCard } from '@/components/BookmarkCard';
import { SearchBar } from '@/components/SearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  deleteBoard,
  fetchBoardBookmarks,
  renameBoard,
  updateBoardCover,
} from '@/lib/api/boards';
import { uploadBoardCover } from '@/lib/api/storage';
import { filterBookmarksLocally } from '@/lib/api/bookmarks';
import { supabase } from '@/lib/supabase/client';
import type { Bookmark, BookmarkWithBoard, Board } from '@/lib/supabase/database.types';
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
  const [coverVisible, setCoverVisible] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);

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
        <View style={styles.headerActions}>
          <Pressable onPress={() => setLinkModalVisible(true)} style={styles.headerBtn}>
            <Ionicons name="add" size={26} color={colors.accent} />
          </Pressable>
          <Pressable onPress={() => setMenuVisible(true)} style={styles.headerBtn}>
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '600' }}>···</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, colors, boardName, bookmarks.length]);

  const filtered = useMemo(() => {
    const withBoard = bookmarks.map(
      (b): BookmarkWithBoard => ({ ...b, board: { id: id!, name: boardName } }),
    );
    return filterBookmarksLocally(withBoard, search);
  }, [bookmarks, search, id, boardName]);

  const boardForLink: Board[] = useMemo(
    () => (user && id ? [{ id, user_id: user.id, name: boardName, cover_url: null, created_at: '' }] : []),
    [user, id, boardName],
  );

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

  const handleSaveCover = async () => {
    if (!user || !id || !coverUri || !isOnline) return;
    setCoverBusy(true);
    try {
      const coverUrl = await uploadBoardCover(user.id, coverUri);
      await updateBoardCover(id, coverUrl, user.id);
      setCoverVisible(false);
      setCoverUri(null);
      setMenuVisible(false);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not update cover');
    } finally {
      setCoverBusy(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!user || !id || !isOnline) return;
    setCoverBusy(true);
    try {
      await updateBoardCover(id, null, user.id);
      setCoverVisible(false);
      setCoverUri(null);
      setMenuVisible(false);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not remove cover');
    } finally {
      setCoverBusy(false);
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
              : 'Tap + to add a link to this board, or share from any app.'}
          </Text>
          {!search.trim() ? (
            <Pressable
              onPress={() => setLinkModalVisible(true)}
              style={({ pressed }) => [
                styles.emptyAddBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Ionicons name="link" size={18} color={colors.onAccent} />
              <Text style={[styles.emptyAddBtnText, { color: colors.onAccent }]}>Add link</Text>
            </Pressable>
          ) : null}
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
            <Pressable
              onPress={() => {
                setCoverUri(null);
                setCoverVisible(true);
              }}
              style={styles.menuItem}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>Change cover</Text>
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

      <Modal visible={coverVisible} transparent animationType="fade">
        <View style={[styles.menuOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.renameTitle, { color: colors.text }]}>Board cover</Text>
            <Pressable
              onPress={pickCover}
              style={[styles.coverPick, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}
            >
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverPreview} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Choose image</Text>
                </View>
              )}
            </Pressable>
            <View style={styles.renameActions}>
              <Pressable
                onPress={() => {
                  setCoverVisible(false);
                  setCoverUri(null);
                }}
                disabled={coverBusy}
              >
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRemoveCover} disabled={coverBusy}>
                <Text style={{ color: colors.danger }}>Remove</Text>
              </Pressable>
              <Pressable onPress={handleSaveCover} disabled={coverBusy || !coverUri}>
                <Text style={{ color: colors.accent, fontWeight: '600', opacity: coverUri ? 1 : 0.4 }}>
                  {coverBusy ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {modals}

      {user && id ? (
        <AddLinkModal
          visible={linkModalVisible}
          userId={user.id}
          boards={boardForLink}
          presetBoardId={id}
          lockBoard
          onClose={() => setLinkModalVisible(false)}
          onSaved={load}
          onRequestNewBoard={() => setLinkModalVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { alignItems: 'center', maxWidth: 220 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 10 },
  headerBoardName: { fontSize: 17, fontWeight: '600' },
  headerLinkCount: { fontSize: 12, marginTop: 2 },
  searchWrap: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyAddBtnText: { fontWeight: '700', fontSize: 15 },
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
    alignItems: 'center',
  },
  coverPick: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 200,
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
