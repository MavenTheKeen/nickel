import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryChip';
import { MoneyText } from '@/components/MoneyText';
import { Button, Empty, Loading, Row, Screen, Section, TextLink } from '@/components/ui';
import {
  useBillSuggestionMutations,
  useBillSuggestions,
  useCategories,
  useRuleMutations,
  useRules,
} from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { daysBetween, toIsoDate } from '@/services/dates';
import { formatShortDate } from '@/services/format';
import { cadenceLabel } from '@/services/recurrence';
import { space, useTheme } from '@/theme/tokens';

function dueText(nextDue: string, today: string, locale: string): string {
  const days = daysBetween(today, nextDue);
  const date = formatShortDate(nextDue, locale, Number(today.slice(0, 4)));
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `Overdue since ${date}`;
  return `Due ${date}, in ${days} days`;
}

export default function BillsScreen() {
  const theme = useTheme();
  const rules = useRules();
  const categories = useCategories(true);
  const suggestions = useBillSuggestions();
  const { markPaid, skip } = useRuleMutations();
  const { accept, dismiss } = useBillSuggestionMutations();
  const locale = useUiStore((s) => s.locale);
  const today = toIsoDate(new Date());

  if (!rules.data || !categories.data) return <Loading />;
  const catById = new Map(categories.data.map((c) => [c.id, c]));
  const found = suggestions.data ?? [];

  return (
    <Screen testID="bills-screen">
      <View style={{ padding: space.lg }}>
        <Button testID="add-bill" label="Add a bill" onPress={() => router.push('/bill')} />
      </View>

      {found.length > 0 && (
        <Section title="Found in your history">
          <AppText
            variant="small"
            tone="textMuted"
            style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}
          >
            These repeat at a regular interval. Adding one starts it at the next expected date, so
            nothing already recorded is repeated.
          </AppText>
          {found.map((s) => {
            const cat = catById.get(s.categoryId);
            return (
              <View
                key={s.key}
                testID={`suggestion-${s.key}`}
                style={{ borderTopWidth: 1, borderTopColor: theme.rule }}
              >
                <Row
                  left={cat ? <CategoryIcon category={cat} /> : undefined}
                  title={s.merchant}
                  subtitle={`${cadenceLabel(s.cadence)} · seen ${s.occurrences} times · next ${formatShortDate(s.nextDate, locale, Number(today.slice(0, 4)))}`}
                  right={<MoneyText cents={s.amountCents} signed weight="medium" />}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    gap: space.xl,
                    paddingHorizontal: space.lg,
                    paddingBottom: space.md,
                    marginLeft: 44,
                  }}
                >
                  <TextLink
                    label="Add as bill"
                    onPress={() => accept.mutate(s)}
                    testID={`suggestion-accept-${s.key}`}
                  />
                  <TextLink
                    label="Not a bill"
                    onPress={() => dismiss.mutate(s.key)}
                    testID={`suggestion-dismiss-${s.key}`}
                  />
                </View>
              </View>
            );
          })}
        </Section>
      )}

      <Section title="Your bills">
        {rules.data.length === 0 ? (
          <Empty
            icon="calendar-sync"
            title="No bills yet"
            text="Bills create a transaction on each due date, and you get a reminder the day before. Bills that repeat in imported transactions are suggested here."
          />
        ) : (
          rules.data.map((rule) => {
            const cat = catById.get(rule.categoryId);
            return (
              <View key={rule.id} style={{ borderTopWidth: 1, borderTopColor: theme.rule }}>
                <Row
                  testID={`bill-${rule.id}`}
                  left={cat ? <CategoryIcon category={cat} /> : undefined}
                  title={rule.merchant || rule.note || cat?.name || 'Bill'}
                  subtitle={`${cadenceLabel(rule.cadence)} · ${dueText(rule.nextDue, today, locale)}`}
                  right={<MoneyText cents={rule.amountCents} signed weight="medium" />}
                  onPress={() =>
                    router.push({ pathname: '/bill', params: { id: String(rule.id) } })
                  }
                  accessibilityHint="Edit this bill"
                />
                <View
                  style={{
                    flexDirection: 'row',
                    gap: space.xl,
                    paddingHorizontal: space.lg,
                    paddingBottom: space.md,
                    marginLeft: 44,
                  }}
                >
                  <TextLink
                    label="Mark paid"
                    onPress={() => markPaid.mutate(rule.id)}
                    testID={`bill-paid-${rule.id}`}
                  />
                  <TextLink
                    label="Skip once"
                    onPress={() => skip.mutate(rule.id)}
                    testID={`bill-skip-${rule.id}`}
                  />
                </View>
              </View>
            );
          })
        )}
      </Section>
      <AppText variant="small" tone="textMuted" style={{ padding: space.lg }}>
        Mark paid records the payment today and moves to the next due date. Skip once moves on
        without recording a payment.
      </AppText>
    </Screen>
  );
}
