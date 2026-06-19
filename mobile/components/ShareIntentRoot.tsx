import type { ReactNode } from 'react';
import { Platform } from 'react-native';

type ShareIntentRootProps = {
  children: ReactNode;
};

export function ShareIntentRoot({ children }: ShareIntentRootProps) {
  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  const { ShareIntentProvider } = require('expo-share-intent');
  return <ShareIntentProvider>{children}</ShareIntentProvider>;
}
