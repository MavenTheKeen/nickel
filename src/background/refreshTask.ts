import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { getDeviceDb } from '@/db/expoDriver';
import { migrate } from '@/db/migrate';
import { insertEvent } from '@/db/repositories/events';
import { attachEventSink, isEventSinkAttached, timed, track } from '@/events/track';
import { onAppStart } from '@/hooks/actions';
import { applyPlan, notifyNow, requestNotificationPermission } from '@/notifications/scheduler';
import { isExpoGo } from '@/platform/runtime';
import { toIsoDate } from '@/services/dates';

export const REFRESH_TASK = 'nickel-background-refresh';
/** The OS decides the actual time; this is the shortest interval it may use. */
const MINIMUM_INTERVAL_MINUTES = 12 * 60;

/**
 * Creates bills that fell due and rebuilds scheduled notifications while the
 * app is closed, so reminders and the weekly summary stay current even if
 * the app is not opened for days. Same code path as an app start.
 */
export async function runRefresh(): Promise<{ generated: number }> {
  const { db } = await getDeviceDb();
  await migrate(db);
  // When the app is already open it owns the event log and its session id.
  if (!isEventSinkAttached()) await attachEventSink((e) => insertEvent(db, e), 'background');
  return timed('background_refresh', async () => {
    const result = await onAppStart(
      db,
      { notifyNow, applyPlan, requestPermission: requestNotificationPermission },
      toIsoDate(new Date()),
    );
    track('app_open', { background: true, recurringGenerated: result.generated });
    return result;
  });
}

// Must run at module load, before the app renders, so the OS can start the
// task in a headless launch. Imported first from index.ts.
if (!TaskManager.isTaskDefined(REFRESH_TASK)) {
  TaskManager.defineTask(REFRESH_TASK, async () => {
    try {
      await runRefresh();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      track('error', {
        screen: 'background_refresh',
        message: e instanceof Error ? e.message : String(e),
      });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Registers the periodic task once. Safe to call on every start. */
export async function registerBackgroundRefresh(): Promise<boolean> {
  if (isExpoGo) return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(REFRESH_TASK))) {
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
    }
    return true;
  } catch {
    return false;
  }
}
