import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShareIntentContext } from 'expo-share-intent';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { saveBookmark } from '@/lib/api/share';
import { detectSourceApp, extractUrl } from '@/lib/utils/source';

const PENDING_SHARE_KEY = 'pending_share';

export type ShareToast = {
  message: string;
  type: 'success' | 'error';
};

export function useShareHandler(onSaved?: () => void) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
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
        await AsyncStorage.setItem(
          PENDING_SHARE_KEY,
          JSON.stringify({ url, title }),
        );
        showToast('Sign in to save this link', 'error');
        return;
      }

      if (!isOnline) {
        await AsyncStorage.setItem(
          PENDING_SHARE_KEY,
          JSON.stringify({ url, title }),
        );
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

  useEffect(() => {
    if (!hasShareIntent || processingRef.current) return;

    const url =
      shareIntent.webUrl ??
      extractUrl(shareIntent.text) ??
      extractUrl(shareIntent.meta?.title);

    if (!url) return;

    processingRef.current = true;
    const title = shareIntent.meta?.title ?? shareIntent.text ?? '';

    processShare(url, title).finally(() => {
      resetShareIntent();
      processingRef.current = false;
    });
  }, [hasShareIntent, shareIntent, processShare, resetShareIntent]);

  useEffect(() => {
    if (!user || !isOnline) return;

    AsyncStorage.getItem(PENDING_SHARE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const pending = JSON.parse(raw) as { url: string; title: string };
        processShare(pending.url, pending.title);
      } catch {
        AsyncStorage.removeItem(PENDING_SHARE_KEY);
      }
    });
  }, [user, isOnline, processShare]);

  return { toast };
}
