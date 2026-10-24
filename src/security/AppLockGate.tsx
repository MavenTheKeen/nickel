import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/ui';
import { track } from '@/events/track';
import { authenticate } from '@/platform/biometrics';
import { space, useTheme } from '@/theme/tokens';

import {
  initialLockState,
  onEnabledChange,
  onPhaseChange,
  onUnlocked,
  shouldCover,
  type AppPhase,
  type LockState,
} from './lockPolicy';

interface AppLockContextValue {
  /** Called by Settings after the user turns the lock on or off. */
  setEnabled: (enabled: boolean) => void;
}

const AppLockContext = createContext<AppLockContextValue>({ setEnabled: () => undefined });
export const useAppLock = () => useContext(AppLockContext);

function toPhase(status: AppStateStatus | string | null | undefined): AppPhase {
  return status === 'active' ? 'active' : status === 'background' ? 'background' : 'inactive';
}

/**
 * Covers the app until the user authenticates, on cold start and after
 * LOCK_GRACE_MS in the background. While the app is not in front the cover
 * also hides balances from the app switcher.
 */
export function AppLockGate({
  initiallyEnabled,
  children,
}: {
  initiallyEnabled: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [state, setState] = useState<LockState>(() => initialLockState(initiallyEnabled));
  const [phase, setPhase] = useState<AppPhase>(toPhase(AppState.currentState));
  const [error, setError] = useState<string | null>(null);
  const prompting = useRef(false);
  // The system prompt itself makes the app briefly inactive; after a cancel
  // the app becomes active again. Prompt automatically only once per return
  // from the background, so a cancel does not reopen the prompt in a loop.
  const autoPrompted = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      const next = toPhase(status);
      if (next === 'background') autoPrompted.current = false;
      setPhase(next);
      setState((s) => onPhaseChange(s, next, Date.now()));
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setError(null);
    const result = await authenticate('Unlock Nickel');
    prompting.current = false;
    if (result.ok) {
      setState(onUnlocked);
    } else if (
      result.error !== 'user_cancel' &&
      result.error !== 'app_cancel' &&
      result.error !== 'system_cancel'
    ) {
      setError('Could not confirm it is you. Try again.');
      track('error', { screen: 'app_lock', message: result.error });
    }
  }, []);

  // Prompt automatically when the lock appears with the app in front.
  useEffect(() => {
    if (state.locked && phase === 'active' && !autoPrompted.current) {
      autoPrompted.current = true;
      void unlock();
    }
  }, [state.locked, phase, unlock]);

  const setEnabled = useCallback(
    (enabled: boolean) => setState((s) => onEnabledChange(s, enabled)),
    [],
  );
  const cover = shouldCover(state, phase);

  return (
    <AppLockContext.Provider value={{ setEnabled }}>
      <View style={{ flex: 1 }} importantForAccessibility={cover ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {cover && (
        <View
          testID="app-lock"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.background,
              justifyContent: 'center',
              padding: space.xl,
              gap: space.md,
            },
          ]}
          accessibilityViewIsModal
        >
          <AppText variant="display" weight="bold" tone="brand">
            Nickel
          </AppText>
          {state.locked && (
            <>
              <AppText tone="textMuted">
                Locked. Unlock with your face, fingerprint or device passcode.
              </AppText>
              {error && (
                <AppText tone="problem" accessibilityLiveRegion="polite">
                  {error}
                </AppText>
              )}
              <Button testID="unlock" label="Unlock" onPress={() => void unlock()} />
            </>
          )}
        </View>
      )}
    </AppLockContext.Provider>
  );
}
