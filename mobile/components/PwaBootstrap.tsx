import { useEffect } from 'react';
import { isWeb } from '@/lib/platform';

export function PwaBootstrap() {
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[Bookmark] Service worker registration failed', error);
    });
  }, []);

  return null;
}
