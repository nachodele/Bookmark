import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchAllBookmarks,
  filterBookmarksLocally,
  searchBookmarks,
} from '@/lib/api/bookmarks';
import type { BookmarkWithBoard } from '@/lib/supabase/database.types';
import { BookmarkCard } from '@/components/BookmarkCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBookmarkActions } from '@/hooks/useBookmarkActions';

const CACHE_KEY = 'bookmarks_search_cache';

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const isOnline = useIsOnline();
  const [query, setQuery] = useState('');
  const [cached, setCached] = useState<BookmarkWithBoard[]>([]);
  const [results, setResults] = useState<BookmarkWithBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { openDetail, modals } = useBookmarkActions(() => runSearch(query));

  const loadCache = useCallback(async () => {
    if (!user) return;

    try {
      if (isOnline) {
        const data = await fetchAllBookmarks(user.id);
        setCached(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } else {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) setCached(JSON.parse(raw) as BookmarkWithBoard[]);
      }
    } catch (error) {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) setCached(JSON.parse(raw) as BookmarkWithBoard[]);
      console.error(error);
    }
  }, [user, isOnline]);

  const runSearch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !user) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        if (isOnline) {
          const data = await searchBookmarks(user.id, trimmed);
          setResults(data);
        } else {
          setResults(filterBookmarksLocally(cached, trimmed));
        }
      } catch {
        setResults(filterBookmarksLocally(cached, trimmed));
      } finally {
        setLoading(false);
      }
    },
    [user, isOnline, cached],
  );

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCache();
    await runSearch(query);
    setRefreshing(false);
  };

  const emptyMessage = useMemo(() => {
    if (!query.trim()) return 'Search links by title, URL, description, or board';
    if (loading) return null;
    return 'No links match your search';
  }, [query, loading]);

  return (
    <Screen>
      <OfflineBanner />
      <View style={styles.header}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search all saved links..."
          autoFocus={false}
        />
      </View>

      {loading && query.trim() ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : null}

      {!query.trim() || results.length === 0 ? (
        <View style={styles.empty}>
          {emptyMessage ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyMessage}</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <BookmarkCard
              bookmark={item}
              boardName={item.board?.name}
              onPress={() => openDetail(item)}
            />
          )}
        />
      )}
      {modals}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 0 },
  loader: { marginTop: 24 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
