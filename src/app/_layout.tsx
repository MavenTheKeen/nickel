import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { bootstrap, deviceEffects, type BootResult } from '@/bootstrap';
import { AppText } from '@/components/AppText';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loading } from '@/components/ui';
import { DbProvider } from '@/db/DbProvider';
import { track } from '@/events/track';
import { AppContextProvider } from '@/hooks/AppContext';
import { useUiStore } from '@/hooks/uiStore';
import { numberFormatFrom } from '@/services/format';
import { getLocales } from 'expo-localization';
import { onNotificationOpened } from '@/notifications/scheduler';
import { AppLockGate } from '@/security/AppLockGate';
import { paletteFor, space } from '@/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: {
    // All data is local: no network retries, and no refetch on focus.
    queries: { retry: false, refetchOnWindowFocus: false, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

export default function RootLayout() {
  const scheme = useColorScheme();
  const palette = paletteFor(scheme);
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const setCurrencySymbol = useUiStore((s) => s.setCurrencySymbol);

  useEffect(() => {
    bootstrap()
      .then((result) => {
        const ui = useUiStore.getState();
        ui.setCurrencySymbol(result.settings.currencySymbol);
        ui.setPeriodStartDay(result.settings.periodStartDay);
        ui.setHomeCurrency(result.settings.homeCurrency);
        const loc = getLocales()[0];
        ui.setLocale(
          loc?.languageTag ?? 'en-US',
          numberFormatFrom(loc?.decimalSeparator, loc?.digitGroupingSeparator),
        );
        setBoot(result);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        track('error', { screen: 'bootstrap', message });
        setBootError(message);
      });
  }, [setCurrencySymbol]);

  useEffect(
    () =>
      onNotificationOpened((data) =>
        track('notification_opened', { kind: String(data.kind ?? 'unknown') }),
      ),
    [],
  );

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.brand,
        background: palette.background,
        card: palette.background,
        text: palette.text,
        border: palette.rule,
      },
    };
  }, [scheme, palette]);

  if (bootError) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: space.xl,
          backgroundColor: palette.background,
        }}
      >
        <AppText variant="title" weight="bold">
          Nickel could not open its database
        </AppText>
        <AppText tone="textMuted" style={{ marginTop: space.sm }}>
          {bootError}
        </AppText>
      </View>
    );
  }
  if (!boot) return <Loading />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <DbProvider db={boot.db}>
          <AppContextProvider
            value={{
              effects: deviceEffects,
              installId: boot.installId,
              onboardingVariant: boot.onboardingVariant,
              listEngine: boot.listEngine,
              encrypted: boot.encrypted,
            }}
          >
            <QueryClientProvider client={queryClient}>
              <AppLockGate initiallyEnabled={boot.settings.appLock}>
                <ErrorBoundary screen="root">
                  <Stack screenOptions={{ headerShadowVisible: false, animation: 'default' }}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen
                      name="transaction"
                      options={{ presentation: 'modal', title: 'Transaction' }}
                    />
                    <Stack.Screen name="bill" options={{ presentation: 'modal', title: 'Bill' }} />
                    <Stack.Screen name="import" options={{ title: 'Import CSV' }} />
                    <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                    <Stack.Screen name="categories" options={{ title: 'Categories' }} />
                    <Stack.Screen name="debug" options={{ title: 'Debug' }} />
                    <Stack.Screen name="goals" options={{ title: 'Goals' }} />
                    <Stack.Screen name="goal" options={{ presentation: 'modal', title: 'Goal' }} />
                    <Stack.Screen name="rules" options={{ title: 'Category rules' }} />
                    <Stack.Screen
                      name="review"
                      options={{ presentation: 'modal', title: 'Review' }}
                    />
                    <Stack.Screen
                      name="receipt"
                      options={{
                        presentation: 'fullScreenModal',
                        title: 'Receipt',
                        headerStyle: { backgroundColor: '#000000' },
                        headerTintColor: '#FFFFFF',
                        animation: 'fade',
                      }}
                    />
                    <Stack.Screen
                      name="onboarding"
                      options={{ headerShown: false, gestureEnabled: false }}
                    />
                  </Stack>
                </ErrorBoundary>
              </AppLockGate>
            </QueryClientProvider>
          </AppContextProvider>
        </DbProvider>
      </ThemeProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}
