import { useEffect, useRef } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { useShareReview } from '@/contexts/ShareReviewContext';
import { extractUrl } from '@/lib/utils/source';

/** Native share sheet → AI preview pipeline. */
export function ShareIntentConsumer() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { openShareReview } = useShareReview();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || processingRef.current) return;

    const url =
      shareIntent.webUrl ??
      extractUrl(shareIntent.text) ??
      extractUrl(shareIntent.meta?.title);

    if (!url) return;

    processingRef.current = true;
    const shareText = (shareIntent.meta?.title ?? shareIntent.text ?? '').trim();
    const title = shareText.replace(url, '').trim() || shareIntent.meta?.title?.trim() || '';

    openShareReview(url, title).finally(() => {
      resetShareIntent();
      processingRef.current = false;
    });
  }, [hasShareIntent, shareIntent, openShareReview, resetShareIntent]);

  return null;
}
