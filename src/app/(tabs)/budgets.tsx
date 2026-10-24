import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryChip';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { MoneyText } from '@/components/MoneyText';
import {
  Button,
  Empty,
  Field,
  Loading,
  ProgressBar,
  Row,
  Rule,
  Screen,
  ToggleRow,
} from '@/components/ui';
import { useBudgets, useCopyBudgets, useSetBudget, useSetRollover } from '@/hooks/queries';
import type { BudgetRow } from '@/hooks/loaders';
import { useUiStore } from '@/hooks/uiStore';
import { centsToDecimalString, formatCents } from '@/services/money';
import { space, useTheme } from '@/theme/tokens';
import { budgetLimitSchema } from '@/types/schemas';

function BudgetEditor({
  row,
  month,
  onDone,
}: {
  row: BudgetRow;
  month: string;
  onDone: () => void;
}) {
  const [text, setText] = useState(
    row.baseLimitCents ? centsToDecimalString(row.baseLimitCents) : '',
  );
  const setRollover = useSetRollover();
  const [error, setError] = useState<string>();
  const setBudget = useSetBudget();
  const save = () => {
    const parsed = budgetLimitSchema(useUiStore.getState().numberFormat.decimal).safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setBudget.mutate(
      { categoryId: row.category.id, month, limitCents: parsed.data },
      { onSuccess: onDone },
    );
  };
  return (
    <View style={{ paddingBottom: space.md }}>
      <Field
        testID="budget-limit-input"
        label={`Monthly limit for ${row.category.name}`}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(undefined);
        }}
        keyboardType="decimal-pad"
        autoFocus
        error={error}
        onSubmitEditing={save}
      />
      <ToggleRow
        testID="rollover-switch"
        label="Roll over"
        hint="Unspent money carries into the next period; overspending comes off it"
        value={row.category.rollover}
        onChange={(rollover) => setRollover.mutate({ categoryId: row.category.id, rollover })}
      />
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          marginTop: space.md,
        }}
      >
        <Button
          testID="budget-save"
          label="Save"
          onPress={save}
          busy={setBudget.isPending}
          style={{ flex: 1 }}
        />
        {row.limitCents !== null && (
          <Button
            label="Remove"
            variant="danger"
            onPress={() =>
              setBudget.mutate(
                { categoryId: row.category.id, month, limitCents: null },
                { onSuccess: onDone },
              )
            }
            style={{ flex: 1 }}
          />
        )}
        <Button label="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export default function BudgetsScreen() {
  const theme = useTheme();
  const { month, setMonth } = useUiStore();
  const budgets = useBudgets(month);
  const copy = useCopyBudgets();
  const [editing, setEditing] = useState<number | null>(null);
  const [copyResult, setCopyResult] = useState<string | null>(null);

  if (!budgets.data) return <Loading />;
  const rows = budgets.data;
  const budgeted = rows.filter((r) => r.limitCents !== null);
  const symbol = useUiStore.getState().currencySymbol;
  const money = (c: number) => formatCents(c, { symbol });

  return (
    <Screen testID="budgets-screen">
      <MonthSwitcher
        month={month}
        onChange={(m) => {
          setMonth(m);
          setEditing(null);
          setCopyResult(null);
        }}
      />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Button
          label="Copy last month's budgets"
          variant="secondary"
          busy={copy.isPending}
          onPress={() =>
            copy.mutate(month, {
              onSuccess: (n) =>
                setCopyResult(
                  n === 0 ? 'Nothing to copy: no new limits last month.' : `Copied ${n} limits.`,
                ),
            })
          }
        />
        {copyResult && (
          <AppText variant="small" tone="textMuted" accessibilityLiveRegion="polite">
            {copyResult}
          </AppText>
        )}
      </View>
      {budgeted.length === 0 && (
        <Empty
          icon="chart-donut"
          title="No limits for this period"
          text="Tap a category below to give it a limit. With limits set, Home shows what is safe to spend each day."
        />
      )}
      <Rule inset={0} />
      {rows.map((row) => {
        const p = row.progress;
        const tone = p?.level === 'over' ? 'problem' : p?.level === 'warn' ? 'warn' : 'textMuted';
        return (
          <View
            key={row.category.id}
            style={{ borderBottomWidth: 1, borderBottomColor: theme.rule }}
          >
            <Row
              testID={`budget-row-${row.category.id}`}
              left={<CategoryIcon category={row.category} />}
              title={row.category.name}
              subtitle={
                p
                  ? [
                      Number.isFinite(p.percent)
                        ? `${p.percent}% used${p.level === 'over' ? ', over budget' : p.level === 'warn' ? ', nearly at limit' : ''}`
                        : 'Over budget',
                      row.carryCents > 0
                        ? `includes ${money(row.carryCents)} carried over`
                        : row.carryCents < 0
                          ? `${money(-row.carryCents)} overspent last period taken off`
                          : row.category.rollover
                            ? 'rolls over'
                            : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'No limit'
              }
              right={
                row.limitCents !== null ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <MoneyText
                      cents={row.spentCents}
                      weight="medium"
                      tone={p?.level === 'ok' ? 'text' : tone}
                    />
                    <AppText variant="small" tone="textMuted">
                      of <MoneyText variant="small" tone="textMuted" cents={row.limitCents} />
                    </AppText>
                  </View>
                ) : row.spentCents > 0 ? (
                  <MoneyText cents={row.spentCents} tone="textMuted" />
                ) : undefined
              }
              onPress={() => setEditing(editing === row.category.id ? null : row.category.id)}
              accessibilityHint="Edit the monthly limit"
            />
            {p && (
              <View
                style={{ paddingHorizontal: space.lg, paddingBottom: space.md, marginLeft: 44 }}
              >
                <ProgressBar percent={p.percent} level={p.level} />
              </View>
            )}
            {editing === row.category.id && (
              <BudgetEditor row={row} month={month} onDone={() => setEditing(null)} />
            )}
          </View>
        );
      })}
    </Screen>
  );
}
