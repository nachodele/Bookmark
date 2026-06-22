import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ShareReviewModal } from '@/components/ShareReviewModal';
import { ShareToastBanner } from '@/components/ShareToastBanner';
import { useShareReviewFlow } from '@/hooks/useShareReviewFlow';

type ShareReviewContextValue = ReturnType<typeof useShareReviewFlow>;

const ShareReviewContext = createContext<ShareReviewContextValue | null>(null);

type ShareReviewProviderProps = {
  children: ReactNode;
  onSaved?: () => void;
};

export function ShareReviewProvider({ children, onSaved }: ShareReviewProviderProps) {
  const { session } = useAuth();
  const flow = useShareReviewFlow(onSaved);

  return (
    <ShareReviewContext.Provider value={flow}>
      {children}
      <ShareToastBanner toast={flow.toast} />
      <ShareReviewModal
        visible={flow.reviewVisible}
        loading={flow.reviewLoading}
        draft={flow.reviewDraft}
        accessToken={session?.access_token ?? null}
        onClose={flow.dismissReview}
        onSaved={flow.handleReviewSaved}
      />
    </ShareReviewContext.Provider>
  );
}

export function useShareReview(): ShareReviewContextValue {
  const ctx = useContext(ShareReviewContext);
  if (!ctx) {
    throw new Error('useShareReview must be used within ShareReviewProvider');
  }
  return ctx;
}

/** Drain queued share after sign-in (web share target + offline queue). */
export function ShareReviewPendingConsumer() {
  const { consumePendingShare } = useShareReview();

  useEffect(() => {
    void consumePendingShare();
  }, [consumePendingShare]);

  return null;
}
