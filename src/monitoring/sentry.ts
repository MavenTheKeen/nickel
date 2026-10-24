import type * as SentryModule from '@sentry/react-native';

import { optionalModule } from '@/platform/runtime';

// Optional crash reporting. Nothing is sent unless both are true:
// 1. the build was made with EXPO_PUBLIC_SENTRY_DSN set, and
// 2. the user turned on "Send crash reports" in Settings (off by default).
// Reports carry the error and stack trace only: no breadcrumbs (they can
// contain on-screen amounts), no screenshots, no view hierarchy, no IP.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let consent = false;
let sentry: typeof SentryModule | null = null;

if (DSN) {
  // Loaded lazily: importing it where the native module is missing throws.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = optionalModule<typeof SentryModule>(() => require('@sentry/react-native'));
  sentry?.init({
    dsn: DSN,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => (consent ? { ...event, user: undefined, request: undefined } : null),
  });
}

/** True when this build can send reports at all; Settings hides the toggle otherwise. */
export const crashReportingAvailable = sentry !== null;

export function setCrashReportingConsent(value: boolean): void {
  consent = value;
}

export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!sentry || !consent) return;
  sentry.captureException(error, { tags: context });
}
