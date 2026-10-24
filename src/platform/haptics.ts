import * as Haptics from 'expo-haptics';

// Haptic feedback for the moments that change data. Failures are ignored:
// some devices have no haptic engine, and feedback is never essential.

const safe = (p: Promise<void>) => p.catch(() => undefined);

export const haptics = {
  /** A save that succeeded. */
  success: () => void safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A destructive action such as a delete. */
  warning: () => void safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Choosing an option: a category, a segment, a date shortcut. */
  select: () => void safe(Haptics.selectionAsync()),
};
