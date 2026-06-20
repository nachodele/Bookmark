import type { ShareReviewDraft, ShareToast } from '@/hooks/useShareHandler';

/** Web Save tab is manual-only; share target pre-fills URL via WebShareCapture + save screen. */
export function useShareHandler(_onSaved?: () => void) {
  return {
    toast: null as ShareToast | null,
    reviewVisible: false,
    reviewLoading: false,
    reviewDraft: null as ShareReviewDraft | null,
    dismissReview: () => {},
    handleReviewSaved: (_boardName: string) => {},
  };
}
