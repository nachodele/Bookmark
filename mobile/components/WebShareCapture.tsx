import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLayoutEffect } from 'react';
import { isWeb } from '@/lib/platform';
import { PENDING_SHARE_KEY } from '@/lib/share/constants';
import { parseIncomingShareParams } from '@/lib/share/incoming';

/** Capture Web Share Target query params before auth redirects strip them. */
export function WebShareCapture() {
  useLayoutEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;

    const payload = parseIncomingShareParams(new URLSearchParams(window.location.search));
    if (!payload) return;

    void AsyncStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(payload));

    const path = window.location.pathname || '/';
    window.history.replaceState({}, '', path);
  }, []);

  return null;
}
