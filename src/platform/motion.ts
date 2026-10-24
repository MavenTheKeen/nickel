import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the user asked the system to reduce motion. Animations in the
 * app check this and jump straight to their end state.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Ease-out cubic: fast at first, settling at the end. */
export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Value between `from` and `to` at progress `t` (0-1), rounded to whole cents. */
export function tweenCents(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * easeOut(Math.min(1, Math.max(0, t))));
}
