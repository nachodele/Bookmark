import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isWeb } from '@/lib/platform';

/** Bottom inset for tab bars / footers — PWA often reports 0 without a CSS probe. */
export function useBottomSafeInset(minFallback = 0): number {
  const insets = useSafeAreaInsets();
  const [webInset, setWebInset] = useState(0);

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;

    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const parsed = parseFloat(getComputedStyle(probe).paddingBottom);
    document.body.removeChild(probe);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setWebInset(parsed);
    }
  }, []);

  if (!isWeb) return Math.max(insets.bottom, minFallback);
  return Math.max(insets.bottom, webInset, minFallback);
}
