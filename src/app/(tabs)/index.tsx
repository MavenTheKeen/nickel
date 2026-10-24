import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { JS_START } from '@/bootstrap';
import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryChip';
import { GoalRow } from '@/components/GoalRow';
import { QuickAdd } from '@/components/QuickAdd';
import { UndoBar } from '@/components/UndoBar';
import { monthLabel } from '@/components/MonthSwitcher';
import { MoneyText } from '@/components/MoneyText';
import { TransactionRow } from '@/components/TransactionRow';
import {
  Button,
  Empty,
  Loading,
  ProgressBar,
  Row,
  Rule,
  Screen,
  Section,
  TextLink,
} from '@/components/ui';
import { now, track, trackTiming } from '@/events/track';
import { useAppContext } from '@/hooks/AppContext';
import {
  useCategories,
  useDeleteTransaction,
  useGoals,
  useHome,
  useMarkReviewSeen,
  useReviewPrompt,
  useSettings,
  useUpdateSettings,
} from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { formatPeriod, formatShortDate } from '@/services/format';
import { daysBetween, toIsoDate } from '@/services/dates';
import { budgetProgress } from '@/services/budgetMath';
import { radius, space, useTheme } from '@/theme/tokens';

let coldStartRecorded = false;

export default function HomeScreen() {
  const theme = useTheme();
  const home = useHome();
  const categories = useCategories(true);
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const { onboardingVariant } = useAppContext();
  const redirected = useRef(false);
  const goals = useGoals();
  const reviewPrompt = useReviewPrompt();
  const markSeen = useMarkReviewSeen();
  const del = useDeleteTransaction();
  const startDay = useUiStore((st) => st.periodStartDay);
  const locale = useUiStore((st) => st.locale);
  const [added, setAdded] = useState<{ id: number; message: string } | null>(null);
  const clearAdded = useCallback(() => setAdded(null), []);
  const today = toIsoDate(new Date());

  // First-run flow: variant A goes through onboarding; variant B lands here
  // with a prompt card and is marked done straight away.
  useEffect(() => {
    if (!settings.data || settings.data.onboardingDone || redirected.current) return;
    redirected.current = true;
    if (onboardingVariant === 'A') {
      router.replace('/onboarding');
    } else {
      track('onboarding_step', { variant: 'B', step: 'home_prompt' });
      updateSettings.mutate({ onboardingDone: true });
    }
  }, [settings.data, onboardingVariant, updateSettings]);

  useEffect(() => {
    if (home.data && !coldStartRecorded) {
      coldStartRecorded = true;
      trackTiming('cold_start', now() - JS_START);
    }
  }, [home.data]);

  if (!home.data || !categories.data) return <Loading />;
  const reviewMonth = reviewPrompt.data ?? null;
  const d = home.data;
  const catById = new Map(categories.data.map((c) => [c.id, c]));
  const progress = budgetProgress(d.budgetedSpentCents, d.totalLimitCents);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={12}
              style={{ paddingHorizontal: space.lg }}
            >
              <MaterialCommunityIcons name="cog-outline" size={24} color={theme.text} />
            </Pressable>
          ),
        }}
      />
      <Screen testID="home-screen">
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <AppText tone="textMuted">{monthLabel(d.month)}</AppText>
          {d.hasBudgets ? (
            <>
              <AppText tone="textMuted" style={{ marginTop: space.md }}>
                Safe to spend today
              </AppText>
              <MoneyText
                testID="safe-to-spend"
                cents={d.safeToSpendCents}
                variant="display"
                weight="bold"
                animate
                tone={d.safeToSpendCents === 0 ? 'problem' : 'text'}
              />
              <View style={{ marginTop: space.md, gap: space.xs }}>
                <ProgressBar percent={progress.percent} level={progress.level} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="small" tone="textMuted">
                    <MoneyText variant="small" tone="textMuted" cents={d.budgetedSpentCents} />{' '}
                    spent
                  </AppText>
                  <AppText variant="small" tone="textMuted">
                    of <MoneyText variant="small" tone="textMuted" cents={d.totalLimitCents} />
                  </AppText>
                </View>
              </View>
            </>
          ) : (
            <View style={{ marginTop: space.md, gap: space.sm }}>
              <AppText tone="textMuted">Spent this month</AppText>
              <MoneyText
                testID="month-spent"
                cents={d.monthExpenseCents}
                variant="display"
                weight="bold"
                animate
              />
              <TextLink
                label="Set a budget to see what is safe to spend"
                onPress={() => router.push('/budgets')}
              />
            </View>
          )}
        </View>

        <View style={{ marginTop: space.xl }}>
          <QuickAdd onAdded={(id, message) => setAdded({ id, message })} />
        </View>

        {reviewMonth && (
          <View
            testID="review-banner"
            style={{
              marginHorizontal: space.lg,
              marginTop: space.lg,
              padding: space.md,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: theme.brand,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
            }}
          >
            <MaterialCommunityIcons name="calendar-check-outline" size={24} color={theme.brand} />
            <Pressable
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/review', params: { month: reviewMonth } })}
              accessibilityRole="button"
              accessibilityLabel={`Review ${formatPeriod(reviewMonth, startDay, locale)}`}
            >
              <AppText weight="medium">
                {formatPeriod(reviewMonth, startDay, locale)} in review
              </AppText>
              <AppText variant="small" tone="textMuted">
                Where the money went, in a few cards
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => markSeen.mutate(reviewMonth)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss review"
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        )}

        {d.recent.length === 0 && onboardingVariant === 'B' && (
          <View
            testID="first-transaction-prompt"
            style={{
              marginHorizontal: space.lg,
              marginTop: space.xl,
              paddingVertical: space.lg,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.rule,
              gap: space.md,
            }}
          >
            <AppText weight="medium">Add your first transaction</AppText>
            <AppText tone="textMuted">
              Record something you bought today, or import a CSV export from your bank.
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button
                label="Add transaction"
                onPress={() => router.push('/transaction')}
                style={{ flex: 1 }}
              />
              <Button
                label="Import CSV"
                variant="secondary"
                onPress={() => router.push('/import')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        {(d.recent.length > 0 || onboardingVariant === 'A') && (
          <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
            <Button
              testID="add-transaction"
              label="Add transaction"
              variant="secondary"
              onPress={() => router.push('/transaction')}
            />
          </View>
        )}

        <Section
          title="Upcoming bills"
          action={<TextLink label="All bills" onPress={() => router.push('/bills')} />}
        >
          {d.upcoming.length === 0 ? (
            <Empty icon="calendar-check-outline" text="Nothing due in the next 7 days." />
          ) : (
            d.upcoming.map((u, i) => {
              const cat = catById.get(u.rule.categoryId);
              return (
                <View key={`${u.rule.id}-${u.date}`}>
                  {i > 0 && <Rule inset={space.lg + 44} />}
                  <Row
                    left={cat ? <CategoryIcon category={cat} /> : undefined}
                    title={u.rule.merchant || u.rule.note || cat?.name || 'Bill'}
                    subtitle={dueLabel(u.date, today, locale)}
                    right={<MoneyText cents={u.rule.amountCents} signed />}
                  />
                </View>
              );
            })
          )}
        </Section>

        <Section
          title="Goals"
          action={
            <TextLink
              label={(goals.data ?? []).length > 0 ? 'All goals' : 'Add a goal'}
              onPress={() => router.push((goals.data ?? []).length > 0 ? '/goals' : '/goal')}
            />
          }
        >
          {(goals.data ?? []).length === 0 ? (
            <Empty
              icon="piggy-bank-outline"
              text="Save towards something, and see how much a month gets you there."
            />
          ) : (
            (goals.data ?? []).slice(0, 3).map((g, i) => (
              <View key={g.id}>
                {i > 0 && <Rule inset={space.lg + 44} />}
                <GoalRow
                  goal={g}
                  today={today}
                  onPress={() => router.push({ pathname: '/goal', params: { id: String(g.id) } })}
                />
              </View>
            ))
          )}
        </Section>

        <Section
          title="Recent"
          action={<TextLink label="See all" onPress={() => router.push('/transactions')} />}
        >
          {d.recent.length === 0 ? (
            <Empty icon="format-list-bulleted" text="Transactions you add or import appear here." />
          ) : (
            d.recent.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <Rule inset={space.lg + 44} />}
                <TransactionRow
                  transaction={t}
                  category={catById.get(t.categoryId)}
                  onPress={(x) =>
                    router.push({ pathname: '/transaction', params: { id: String(x.id) } })
                  }
                />
              </View>
            ))
          )}
        </Section>
      </Screen>
      {added && (
        <UndoBar
          message={added.message}
          onTimeout={clearAdded}
          onUndo={() => {
            del.mutate(added.id);
            setAdded(null);
          }}
        />
      )}
    </>
  );
}

function dueLabel(date: string, today: string, locale: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${formatShortDate(date, locale, Number(today.slice(0, 4)))}, in ${days} days`;
}
