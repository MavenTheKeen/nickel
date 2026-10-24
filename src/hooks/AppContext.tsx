import { createContext, useContext, type ReactNode } from 'react';

import { noEffects, type Effects } from './actions';

interface AppContextValue {
  effects: Effects;
  installId: string;
  onboardingVariant: 'A' | 'B';
  listEngine: 'flash' | 'flat';
  /** Whether the database file is encrypted (false in Expo Go). */
  encrypted: boolean;
}

const AppContext = createContext<AppContextValue>({
  effects: noEffects,
  installId: 'unknown',
  onboardingVariant: 'A',
  listEngine: 'flat',
  encrypted: false,
});

export function AppContextProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  return useContext(AppContext);
}
