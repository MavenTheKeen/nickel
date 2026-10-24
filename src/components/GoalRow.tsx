import { useUiStore } from '@/hooks/uiStore';
import { goalProgress, type GoalProgress } from '@/services/goalMath';
import { formatShortDate } from '@/services/format';
import { formatCents } from '@/services/money';
import { space } from '@/theme/tokens';
import type { Goal, IsoDate } from '@/types/domain';
import { View } from 'react-native';

import { AppText } from './AppText';
import { CategoryIcon } from './CategoryChip';
import { MoneyText } from './MoneyText';
import { ProgressBar, Row } from './ui';

/** One sentence on where a goal stands, used under the progress bar. */
export function goalStatusText(
  goal: Goal,
  p: GoalProgress,
  money: (c: number) => string,
  locale: string,
  today: IsoDate,
): string {
  const by = goal.targetDate
    ? formatShortDate(goal.targetDate, locale, Number(today.slice(0, 4)))
    : '';
  switch (p.status) {
    case 'done':
      return 'Reached';
    case 'no_date':
      return `${money(p.remainingCents)} to go`;
    case 'overdue':
      return `${money(p.remainingCents)} to go, target date was ${by}`;
    case 'on_track':
      return `${money(p.perMonthCents ?? 0)} a month to reach it by ${by} · on track`;
    case 'behind':
      return `${money(p.perMonthCents ?? 0)} a month to reach it by ${by} · behind`;
  }
}

export function GoalRow({
  goal,
  today,
  onPress,
}: {
  goal: Goal;
  today: IsoDate;
  onPress?: () => void;
}) {
  const symbol = useUiStore((s) => s.currencySymbol);
  const locale = useUiStore((s) => s.locale);
  const p = goalProgress(goal, today);
  const money = (c: number) => formatCents(c, { symbol });
  const status = goalStatusText(goal, p, money, locale, today);
  return (
    <View>
      <Row
        testID={`goal-${goal.id}`}
        left={<CategoryIcon category={goal} />}
        title={goal.name}
        subtitle={status}
        right={
          <View style={{ alignItems: 'flex-end' }}>
            <MoneyText cents={Math.max(0, goal.savedCents)} weight="medium" animate />
            <AppText variant="small" tone="textMuted">
              of <MoneyText variant="small" tone="textMuted" cents={goal.targetCents} />
            </AppText>
          </View>
        }
        onPress={onPress}
        accessibilityLabel={`${goal.name}, ${money(Math.max(0, goal.savedCents))} of ${money(goal.targetCents)}, ${status}`}
        accessibilityHint={onPress ? 'Opens the goal' : undefined}
      />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, marginLeft: 44 }}>
        <ProgressBar
          percent={p.percent}
          level={p.status === 'behind' || p.status === 'overdue' ? 'warn' : 'ok'}
        />
      </View>
    </View>
  );
}
