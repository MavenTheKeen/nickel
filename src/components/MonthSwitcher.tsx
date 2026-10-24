import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { addMonthsToMonth, parseIsoMonth } from '@/services/dates';
import { useUiStore } from '@/hooks/uiStore';
import { formatPeriod } from '@/services/format';
import { space, useTheme } from '@/theme/tokens';
import type { IsoMonth } from '@/types/domain';

import { AppText } from './AppText';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthLabel(month: IsoMonth): string {
  const p = parseIsoMonth(month);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : month;
}

export function shortMonthLabel(month: IsoMonth): string {
  const p = parseIsoMonth(month);
  return p ? (MONTHS[p.m - 1] ?? '').slice(0, 3) : month;
}

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: IsoMonth;
  onChange: (m: IsoMonth) => void;
}) {
  const theme = useTheme();
  const startDay = useUiStore((s) => s.periodStartDay);
  const locale = useUiStore((s) => s.locale);
  const arrow = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onChange(addMonthsToMonth(month, dir))}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? 'Previous period' : 'Next period'}
      hitSlop={12}
      style={{ padding: space.sm }}
    >
      <MaterialCommunityIcons
        name={dir < 0 ? 'chevron-left' : 'chevron-right'}
        size={24}
        color={theme.text}
      />
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.rule,
      }}
    >
      {arrow(-1)}
      <AppText weight="medium" accessibilityRole="header">
        {formatPeriod(month, startDay, locale)}
      </AppText>
      {arrow(1)}
    </View>
  );
}
