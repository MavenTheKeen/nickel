import { memo } from 'react';

import { useUiStore } from '@/hooks/uiStore';
import { formatShortDate } from '@/services/format';
import { formatMinor } from '@/services/fx';
import type { Category, Transaction } from '@/types/domain';

import { CategoryIcon } from './CategoryChip';
import { MoneyText } from './MoneyText';
import { Row } from './ui';

export interface TransactionRowProps {
  transaction: Transaction;
  category: Category | undefined;
  onPress?: (t: Transaction) => void;
}

const FALLBACK = { icon: 'dots-horizontal', color: '#616161' };

export function transactionTitle(t: Transaction, category: Category | undefined): string {
  return t.merchant || t.note || category?.name || 'Transaction';
}

export const TransactionRow = memo(function TransactionRow({
  transaction: t,
  category,
  onPress,
}: TransactionRowProps) {
  const title = transactionTitle(t, category);
  const locale = useUiStore((st) => st.locale);
  const subtitle = [
    formatShortDate(t.date, locale, new Date().getFullYear()),
    t.original ? formatMinor(t.original.minor, t.original.currency, locale) : '',
    category?.name,
    t.merchant && t.note ? t.note : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const kind = t.amountCents < 0 ? 'expense' : 'income';
  return (
    <Row
      testID={`transaction-${t.id}`}
      left={<CategoryIcon category={category ?? FALLBACK} />}
      title={title}
      subtitle={subtitle}
      right={<MoneyText cents={t.amountCents} signed weight="medium" />}
      onPress={onPress ? () => onPress(t) : undefined}
      accessibilityLabel={`${title}, ${kind}, ${(Math.abs(t.amountCents) / 100).toFixed(2)}, ${t.date}`}
      accessibilityHint={onPress ? 'Opens the transaction for editing' : undefined}
    />
  );
});
