import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { previewShareBookmark } from '@/lib/api/share';
import { PENDING_SHARE_KEY } from '@/lib/share/constants';
import { detectSourceApp } from '@/lib/utils/source';

export type ShareToast = {
  message: string;
  type: 'success' | 'error';
};

export type ShareReviewDraft = {
  userId: string;
  url: string;
  title: string;
  description: string;
  boardName: string;
  boardId: string | null;
  isNewBoard: boolean;
  thumbnailUrl: string | null;
  sourceApp: string;
};

export function useShareReviewFlow(onSaved?: () => void) {
  const { user, session } = useAuth();
  const isOnline = useIsOnline();
  const [toast, setToast] = useState<ShareToast | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ShareReviewDraft | null>(null);

  const showToast = useCallback((message: string, type: ShareToast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const dismissReview = useCallback(() => {
    setReviewVisible(false);
    setReviewLoading(false);
    setReviewDraft(null);
  }, []);

  const openShareReview = useCallback(
    async (url: string, title = '') => {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;

      if (!user) {
        await AsyncStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ url: trimmedUrl, title }));
        showToast('Sign in to save this link', 'error');
        return;
      }

      if (!isOnline) {
        await AsyncStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ url: trimmedUrl, title }));
        showToast('Offline — link queued until connected', 'error');
        return;
      }

      if (!session?.access_token) {
        showToast('Sign in to save this link', 'error');
        return;
      }

      setReviewVisible(true);
      setReviewLoading(true);
      setReviewDraft(null);

      try {
        const result = await previewShareBookmark(session.access_token, {
          url: trimmedUrl,
          title,
          source_app: detectSourceApp(trimmedUrl),
        });

        await AsyncStorage.removeItem(PENDING_SHARE_KEY);

        if (result.already_saved) {
          dismissReview();
          showToast(`Already in ${result.board_name ?? 'your board'}`, 'success');
          return;
        }

        setReviewDraft({
          userId: user.id,
          url: result.url ?? trimmedUrl,
          title: result.title ?? title,
          description: result.description ?? '',
          boardName: result.board_name ?? 'Other',
          boardId: result.board_id ?? null,
          isNewBoard: Boolean(result.is_new_board),
          thumbnailUrl: result.thumbnail_url ?? null,
          sourceApp: result.source_app ?? detectSourceApp(trimmedUrl),
        });
      } catch (error) {
        dismissReview();
        const message = error instanceof Error ? error.message : 'Failed to analyze link';
        showToast(message, 'error');
      } finally {
        setReviewLoading(false);
      }
    },
    [user, session, isOnline, showToast, dismissReview],
  );

  const handleReviewSaved = useCallback(
    (boardName: string) => {
      showToast(`Saved to ${boardName}`, 'success');
      onSaved?.();
    },
    [showToast, onSaved],
  );

  const consumePendingShare = useCallback(async () => {
    if (!user || !isOnline) return;

    const raw = await AsyncStorage.getItem(PENDING_SHARE_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as { url: string; title?: string };
      if (pending.url) {
        await openShareReview(pending.url, pending.title ?? '');
      } else {
        await AsyncStorage.removeItem(PENDING_SHARE_KEY);
      }
    } catch {
      await AsyncStorage.removeItem(PENDING_SHARE_KEY);
    }
  }, [user, isOnline, openShareReview]);

  return {
    toast,
    reviewVisible,
    reviewLoading,
    reviewDraft,
    dismissReview,
    handleReviewSaved,
    openShareReview,
    consumePendingShare,
  };
}
