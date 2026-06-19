import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { PENDING_SHARE_KEY } from '@/lib/share/constants';
import { saveBookmark } from '@/lib/api/share';
import { detectSourceApp } from '@/lib/utils/source';

export type ShareToast = {
  message: string;
  type: 'success' | 'error';
};

export function useShareHandler(onSaved?: () => void) {
  const { user, session } = useAuth();
  const isOnline = useIsOnline();
  const [toast, setToast] = useState<ShareToast | null>(null);
  const processingRef = useRef(false);

  const showToast = useCallback((message: string, type: ShareToast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const processShare = useCallback(
    async (url: string, title: string) => {
      if (!user) {
        await AsyncStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ url, title }));
        showToast('Sign in to save this link', 'error');
        return;
      }

      if (!isOnline) {
        await AsyncStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ url, title }));
        showToast('Offline — link queued until connected', 'error');
        return;
      }

      try {
        if (!session?.access_token) {
          showToast('Sign in to save this link', 'error');
          return;
        }

        const result = await saveBookmark(session.access_token, {
          url,
          title,
          source_app: detectSourceApp(url),
        });

        await AsyncStorage.removeItem(PENDING_SHARE_KEY);
        showToast(`Saved to ${result.board_name ?? 'your board'}`, 'success');
        onSaved?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save link';
        showToast(message, 'error');
      }
    },
    [user, session, isOnline, showToast, onSaved],
  );

  const drainPendingShare = useCallback(async () => {
    if (processingRef.current) return;

    const raw = await AsyncStorage.getItem(PENDING_SHARE_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as { url: string; title: string };
      if (!pending.url) return;

      processingRef.current = true;
      await processShare(pending.url, pending.title ?? '');
    } catch {
      await AsyncStorage.removeItem(PENDING_SHARE_KEY);
    } finally {
      processingRef.current = false;
    }
  }, [processShare]);

  useEffect(() => {
    void drainPendingShare();
  }, [drainPendingShare, user, isOnline]);

  return { toast };
}
