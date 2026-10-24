import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryChip';
import { BarChart, DonutChart } from '@/components/charts';
import { monthLabel, MonthSwitcher, shortMonthLabel } from '@/components/MonthSwitcher';
import { MoneyText } from '@/components/MoneyText';
import { Button, Empty, Loading, Row, Rule, Screen, Section } from '@/components/ui';
import { useCategories, useInsights } from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { formatCents } from '@/services/money';
import { space } from '@/theme/tokens';

const FALLBACK = { icon: 'dots-horizontal', color: '#616161' };

export default function InsightsScreen() {
  const { month, setMonth, setCategoryFilter, setSearch } = useUiStore();
  const symbol = useUiStore((s) => s.currencySymbol);
  const insights = useInsights(month);
  const categories = useCategories(true);
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);

  if (!insights.data || !categories.data) return <Loading />;
  const catById = new Map(categories.data.map((c) => [c.id, c]));
  const { byCategory, trend, merchants, largest } = insights.data;
  const total = byCategory.reduce((s, c) => s + c.spentCents, 0);
  const slices = byCategory.map((c) => ({
    key: String(c.categoryId),
    value: c.spentCents,
    color: catById.get(c.categoryId)?.color ?? FALLBACK.color,
    label: catById.get(c.categoryId)?.name ?? 'Unknown',
  }));
  const selectedSlice = slices.find((s) => s.key === selected) ?? null;
  const money = (c: number) => formatCents(c, { symbol });
  const donutLabel =
    `Spending by category for ${monthLabel(month)}: ` +
    slices.map((s) => `${s.label} ${money(s.value)}`).join(', ');
  const bars = trend.map((t) => ({
    key: t.month,
    label: shortMonthLabel(t.month).slice(0, 1),
    value: t.expenseCents,
  }));
  const trendLabel =
    'Spending over the last 12 months: ' +
    trend.map((t) => `${monthLabel(t.month)} ${money(t.expenseCents)}`).join(', ');

  const showTransactions = (filter: { categoryId?: number; search?: string }) => {
    setCategoryFilter(filter.categoryId ?? null);
    setSearch(filter.search ?? '');
    router.push('/transactions');
  };

  return (
    <Screen testID="insights-screen">
      <MonthSwitcher
        month={month}
        onChange={(m) => {
          setMonth(m);
          setSelected(null);
        }}
      />

      {total > 0 && (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <Button
            testID="open-review"
            label={`Review ${monthLabel(month)}`}
            variant="secondary"
            onPress={() => router.push({ pathname: '/review', params: { month } })}
          />
        </View>
      )}

      <Section title="By category">
        {total === 0 ? (
          <Empty
            icon="chart-donut"
            title="No spending yet"
            text="Spending for this period appears here, split by category."
          />
        ) : (
          <>
            <View style={{ alignItems: 'center', paddingVertical: space.md }}>
              <DonutChart
                slices={slices}
                label={donutLabel}
                selectedKey={selected}
                onSelect={setSelected}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText
                  variant="small"
                  tone="textMuted"
                  numberOfLines={1}
                  style={{ maxWidth: 110 }}
                >
                  {selectedSlice ? selectedSlice.label : 'Spent'}
                </AppText>
                <MoneyText
                  cents={selectedSlice ? selectedSlice.value : total}
                  weight="bold"
                  animate
                />
                {selectedSlice && (
                  <AppText variant="small" tone="textMuted">
                    {Math.round((selectedSlice.value * 100) / total)}%
                  </AppText>
                )}
              </View>
            </View>
            {byCategory.map((c, i) => {
              const cat = catById.get(c.categoryId);
              const key = String(c.categoryId);
              const isSelected = key === selected;
              return (
                <View key={c.categoryId} style={{ opacity: selected && !isSelected ? 0.5 : 1 }}>
                  {i > 0 && <Rule inset={space.lg + 44} />}
                  <Row
                    testID={`insight-category-${c.categoryId}`}
                    left={<CategoryIcon category={cat ?? FALLBACK} />}
                    title={cat?.name ?? 'Unknown'}
                    subtitle={`${Math.round((c.spentCents * 100) / total)}% of spending${isSelected ? ' · tap again for transactions' : ''}`}
                    right={<MoneyText cents={c.spentCents} />}
                    onPress={() =>
                      isSelected ? showTransactions({ categoryId: c.categoryId }) : setSelected(key)
                    }
                    accessibilityHint={
                      isSelected
                        ? 'Shows these transactions'
                        : 'Highlights this category in the chart'
                    }
                  />
                </View>
              );
            })}
          </>
        )}
      </Section>

      <Section title="Last 12 periods">
        <View style={{ paddingHorizontal: space.lg }}>
          <BarChart
            bars={bars}
            width={width - space.lg * 2}
            highlightKey={month}
            label={trendLabel}
            onSelect={(m) => {
              setMonth(m);
              setSelected(null);
            }}
            valueLabel={(b) => money(b.value)}
          />
          <AppText variant="small" tone="textMuted" style={{ marginTop: space.xs }}>
            Tap a bar to see that period.
          </AppText>
        </View>
      </Section>

      <Section title="Top merchants">
        {merchants.length === 0 ? (
          <Empty
            icon="storefront-outline"
            text="Add a merchant to transactions to see where money goes."
          />
        ) : (
          merchants.map((m, i) => (
            <View key={m.merchant}>
              {i > 0 && <Rule />}
              <Row
                title={m.merchant}
                subtitle={`${m.count} ${m.count === 1 ? 'purchase' : 'purchases'}`}
                right={<MoneyText cents={m.spentCents} />}
                onPress={() => showTransactions({ search: m.merchant })}
                accessibilityHint="Shows these transactions"
              />
            </View>
          ))
        )}
      </Section>

      <Section title="Biggest expenses">
        {largest.length === 0 ? (
          <Empty icon="receipt" text="The largest expenses of the period appear here." />
        ) : (
          largest.map((e, i) => {
            const cat = catById.get(e.categoryId);
            return (
              <View key={e.id}>
                {i > 0 && <Rule inset={space.lg + 44} />}
                <Row
                  left={<CategoryIcon category={cat ?? FALLBACK} />}
                  title={e.merchant || e.note || cat?.name || 'Expense'}
                  subtitle={`${e.date} · ${cat?.name ?? ''}`}
                  right={<MoneyText cents={e.amountCents} signed />}
                  onPress={() =>
                    router.push({ pathname: '/transaction', params: { id: String(e.id) } })
                  }
                />
              </View>
            );
          })
        )}
      </Section>
    </Screen>
  );
}
