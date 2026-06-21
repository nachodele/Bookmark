import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AddLinkModal } from '@/components/AddLinkModal';
import { BoardCard } from '@/components/BoardCard';
import { CreateBoardModal } from '@/components/CreateBoardModal';
import { InfoModal } from '@/components/InfoModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { GuideButton, OnboardingTutorial } from '@/components/OnboardingTutorial';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { fetchBoards, filterBoardsByName } from '@/lib/api/boards';
import { getGuideSteps, GUIDE } from '@/lib/content/info';
import { ONBOARDING_PENDING_KEY, clearOnboardingPending, type OnboardingStep } from '@/lib/onboarding';
import { isPasswordSetupRequired } from '@/lib/auth/password-setup';
import { PENDING_SHARE_KEY } from '@/lib/share/constants';
import type { Board, BoardWithCount } from '@/lib/supabase/database.types';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import { isWeb } from '@/lib/platform';
import { Redirect, router } from 'expo-router';

const CACHE_KEY = 'boards_cache';
const GRID_PADDING = 12;
const CARD_MARGIN = 4;
/** Header + search + action buttons + tab bar + safe area (approx.) */
const CHROME_HEIGHT = 280;

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isOnline = useIsOnline();
  const [boards, setBoards] = useState<BoardWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [boardModalVisible, setBoardModalVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [guideVisible, setGuideVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [reopenLinkAfterBoard, setReopenLinkAfterBoard] = useState(false);

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

  const checkOnboarding = useCallback(async () => {
    if (!user) return;
    if (await isPasswordSetupRequired()) return;

    const pending = await AsyncStorage.getItem(ONBOARDING_PENDING_KEY);
    if (pending === '1') {
      setOnboardingStep(0);
      setOnboardingVisible(true);
    }
  }, [user]);

  const finishOnboarding = useCallback(async () => {
    await clearOnboardingPending();
    setOnboardingVisible(false);
  }, []);

  const boardCardHeight = useMemo(() => {
    const cardWidth = (screenWidth - GRID_PADDING * 2 - CARD_MARGIN * 4) / 2;
    const maxHeight = (screenHeight - CHROME_HEIGHT - CARD_MARGIN * 6) / 3;
    return Math.min(Math.round(cardWidth * 0.68), Math.floor(maxHeight));
  }, [screenWidth, screenHeight]);

  const loadPendingShareUrl = useCallback(async () => {
    if (!isWeb) return;
    const raw = await AsyncStorage.getItem(PENDING_SHARE_KEY);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as { url: string };
      if (pending.url) {
        setPendingLinkUrl(pending.url);
        setLinkModalVisible(true);
      }
    } finally {
      await AsyncStorage.removeItem(PENDING_SHARE_KEY);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      void loadPendingShareUrl();
      if (user) void checkOnboarding();
    }, [load, loadPendingShareUrl, user, checkOnboarding]),
  );

  useEffect(() => {
    if (user) void checkOnboarding();
  }, [user, checkOnboarding]);

  const filteredBoards = useMemo(
    () => filterBoardsByName(boards, search),
    [boards, search],
  );

  const boardList: Board[] = useMemo(
    () => boards.map(({ id, user_id, name, cover_url, created_at }) => ({
      id,
      user_id,
      name,
      cover_url,
      created_at,
    })),
    [boards],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleOnboardingAction = (step: OnboardingStep) => {
    setOnboardingVisible(false);
    if (step.action === 'open_board') {
      setBoardModalVisible(true);
    } else if (step.action === 'open_link') {
      setLinkModalVisible(true);
    }
  };

  const advanceOnboardingAfterAction = () => {
    setOnboardingStep((i) => Math.min(i + 1, 4));
    setOnboardingVisible(true);
  };

  if (!user) {
    return <Redirect href="/account" />;
  }

  if (loading) {
    return (
      <>
        <Screen style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </Screen>
        <OnboardingTutorial
          visible={onboardingVisible}
          stepIndex={onboardingStep}
          onStepChange={setOnboardingStep}
          onAction={handleOnboardingAction}
          onComplete={() => void finishOnboarding()}
          onSkip={() => void finishOnboarding()}
        />
      </>
    );
  }

  return (
    <>
    <Screen>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.greeting, { color: colors.text }]}>Bookmark</Text>
          <GuideButton onPress={() => setGuideVisible(true)} />
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search boards..." />
        <View style={styles.actions}>
          <Pressable
            onPress={() => setLinkModalVisible(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionPrimary,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name="link" size={18} color={colors.onAccent} />
            <Text style={[styles.actionPrimaryText, { color: colors.onAccent }]}>Add link</Text>
          </Pressable>
          <Pressable
            onPress={() => setBoardModalVisible(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionSecondary,
              {
                borderColor: colors.surfaceBorder,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Ionicons name="albums-outline" size={18} color={colors.accent} />
            <Text style={[styles.actionSecondaryText, { color: colors.text }]}>New board</Text>
          </Pressable>
        </View>
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
              {search.trim() ? 'No boards match' : 'Start with a board'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search.trim()
                ? 'Try a different search term'
                : 'Tap New board to create a category, then Add link to save something manually.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BoardCard
            board={item}
            height={boardCardHeight}
            onPress={() => router.push(`/board/${item.id}`)}
          />
        )}
      />

      {user ? (
        <>
          <CreateBoardModal
            visible={boardModalVisible}
            userId={user.id}
            onClose={() => setBoardModalVisible(false)}
            onCreated={async () => {
              await load();
              if (reopenLinkAfterBoard) {
                setReopenLinkAfterBoard(false);
                setLinkModalVisible(true);
              }
              if (onboardingStep === 1) advanceOnboardingAfterAction();
            }}
          />
          <AddLinkModal
            visible={linkModalVisible}
            userId={user.id}
            boards={boardList}
            initialUrl={pendingLinkUrl}
            onClose={() => {
              setLinkModalVisible(false);
              setPendingLinkUrl('');
            }}
            onSaved={async () => {
              await load();
              if (onboardingStep === 2) advanceOnboardingAfterAction();
            }}
            onRequestNewBoard={() => {
              setLinkModalVisible(false);
              setBoardModalVisible(true);
              setReopenLinkAfterBoard(true);
            }}
          />
        </>
      ) : null}

      <InfoModal visible={guideVisible} title={GUIDE.title} onClose={() => setGuideVisible(false)}>
        <Text style={[styles.guideIntro, { color: colors.textSecondary }]}>{GUIDE.intro}</Text>
        {getGuideSteps().map((step) => (
          <View key={step.title} style={styles.guideStep}>
            <Text style={[styles.guideStepTitle, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.guideStepBody, { color: colors.textSecondary }]}>{step.body}</Text>
          </View>
        ))}
      </InfoModal>
    </Screen>

    <OnboardingTutorial
      visible={onboardingVisible}
      stepIndex={onboardingStep}
      onStepChange={setOnboardingStep}
      onAction={handleOnboardingAction}
      onComplete={() => void finishOnboarding()}
      onSkip={() => void finishOnboarding()}
    />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, paddingBottom: 8, gap: 12 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 28, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  actionPrimary: {},
  actionPrimaryText: { fontWeight: '700', fontSize: 15 },
  actionSecondary: { borderWidth: 1 },
  actionSecondaryText: { fontWeight: '600', fontSize: 15 },
  grid: { paddingHorizontal: GRID_PADDING, paddingBottom: 24 },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  guideIntro: { fontSize: 15, lineHeight: 24, marginBottom: 16 },
  guideStep: { marginBottom: 20, gap: 6 },
  guideStepTitle: { fontSize: 16, fontWeight: '600' },
  guideStepBody: { fontSize: 15, lineHeight: 22 },
});
