import { useShareReviewFlow } from '@/hooks/useShareReviewFlow';

export type { ShareReviewDraft, ShareToast } from '@/hooks/useShareReviewFlow';

/** Web/PWA — no native share intent; pending shares handled via ShareReviewPendingConsumer. */
export function useShareHandler(onSaved?: () => void) {
  return useShareReviewFlow(onSaved);
}
