import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type NetworkContextValue = {
  isConnected: boolean;
  isInternetReachable: boolean;
};

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
  isInternetReachable: true,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
      setIsInternetReachable(state.isInternetReachable ?? true);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      isConnected,
      isInternetReachable,
    }),
    [isConnected, isInternetReachable],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  return useContext(NetworkContext);
}

export function useIsOnline() {
  const { isConnected, isInternetReachable } = useNetwork();
  return isConnected && isInternetReachable !== false;
}
