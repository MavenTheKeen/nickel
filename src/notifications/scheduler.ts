import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { toLocalDate, type PlannedNotification } from './plan';

const CHANNEL_ID = 'reminders';

/** Show notifications while the app is open too. Called once at startup. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Bills and budgets',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Asks once; if the user declines, the app keeps working without notifications. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  if (await hasNotificationPermission()) return true;
  const s = await Notifications.requestPermissionsAsync();
  return s.granted;
}

/**
 * Replaces every scheduled notification with the plan. Rebuilding the whole
 * set after each change (and on every start) covers edits, deleted bills,
 * device restarts and time zone changes with one code path.
 * Returns the number scheduled, or null without permission.
 */
export async function applyPlan(plan: readonly PlannedNotification[]): Promise<number | null> {
  if (!(await hasNotificationPermission())) return null;
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  let scheduled = 0;
  for (const n of plan) {
    const date = toLocalDate(n.at);
    if (date.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: n.data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
    scheduled++;
  }
  return scheduled;
}

/** Immediate notification, used for budget warnings. */
export async function notifyNow(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

export function onNotificationOpened(
  listener: (data: Record<string, unknown>) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    listener((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}
