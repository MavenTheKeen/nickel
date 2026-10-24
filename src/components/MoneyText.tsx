import { useEffect, useRef, useState } from 'react';

import { useUiStore } from '@/hooks/uiStore';
import { tweenCents, useReducedMotion } from '@/platform/motion';
import { formatCents } from '@/services/money';

import { AppText, type AppTextProps } from './AppText';

export interface MoneyTextProps extends Omit<AppTextProps, 'children'> {
  cents: number;
  /** Show "+" on positive values and colour income. */
  signed?: boolean;
  /**
   * Count from the old value to the new one when `cents` changes. The first
   * render shows the value directly, so opening a screen never waits on it.
   */
  animate?: boolean;
}

const DURATION_MS = 450;

function useAnimatedCents(target: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (!enabled || reduced || shownRef.current === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = (Date.now() - start) / DURATION_MS;
      const value = tweenCents(from, target, t);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, reduced]);
  return enabled ? shown : target;
}

/** The only place money is formatted for display. */
export function MoneyText({
  cents,
  signed = false,
  animate = false,
  tone,
  ...rest
}: MoneyTextProps) {
  const symbol = useUiStore((s) => s.currencySymbol);
  const { decimal, group } = useUiStore((s) => s.numberFormat);
  const shown = useAnimatedCents(cents, animate);
  const format = (c: number) => formatCents(c, { symbol, signed, decimal, group });
  const resolvedTone = tone ?? (signed && cents > 0 ? 'income' : 'text');
  return (
    <AppText
      {...rest}
      // Screen readers hear the final amount, not the numbers in between.
      accessibilityLabel={rest.accessibilityLabel ?? (animate ? format(cents) : undefined)}
      tone={resolvedTone}
      style={[{ fontVariant: ['tabular-nums'] }, rest.style]}
    >
      {format(shown)}
    </AppText>
  );
}
