import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True inside the Expo Go app. Expo Go only contains Expo's bundled native
 * modules, so features that need others (SQLCipher, quick actions, widgets,
 * Sentry's native layer) are skipped there and work in development and
 * release builds.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Loads a module that may be missing in the current runtime. Returns null
 * instead of throwing, so the feature degrades rather than crashing the app.
 */
export function optionalModule<T>(load: () => T): T | null {
  if (isExpoGo) return null;
  try {
    return load();
  } catch {
    return null;
  }
}
