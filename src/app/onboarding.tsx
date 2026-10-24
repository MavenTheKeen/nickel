import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { CategoryChip } from '@/components/CategoryChip';
import { Button, Field, Loading, Screen, TextLink } from '@/components/ui';
import { track } from '@/events/track';
import {
  useCategories,
  useCategoryMutations,
  useSetBudget,
  useUpdateSettings,
} from '@/hooks/queries';
import { periodOf, toIsoDate } from '@/services/dates';
import { useUiStore } from '@/hooks/uiStore';
import { space, useTheme } from '@/theme/tokens';
import { budgetLimitSchema } from '@/types/schemas';

// Variant A of the onboarding experiment: three short steps before Home.
// Every step is logged so drop-off per step can be measured.

type Step = 'categories' | 'budget' | 'done';

export default function OnboardingScreen() {
  const theme = useTheme();
  const categories = useCategories(true);
  const { archive } = useCategoryMutations();
  const setBudget = useSetBudget();
  const updateSettings = useUpdateSettings();
  const [step, setStep] = useState<Step>('categories');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [budgetCategory, setBudgetCategory] = useState<number | null>(null);
  const [limit, setLimit] = useState('');
  const [limitError, setLimitError] = useState<string>();

  useEffect(() => {
    track('onboarding_step', { variant: 'A', step });
  }, [step]);

  if (!categories.data) return <Loading />;
  const expense = categories.data.filter((c) => !c.isIncome && !c.archived);
  const finish = (next: 'home' | 'add') => {
    track('onboarding_step', { variant: 'A', step: next === 'add' ? 'finished_add' : 'finished' });
    updateSettings.mutate(
      { onboardingDone: true },
      {
        onSuccess: () => {
          router.replace('/');
          if (next === 'add') router.push('/transaction');
        },
      },
    );
  };

  const skip = (
    <TextLink
      label="Skip setup"
      onPress={() => {
        track('onboarding_step', { variant: 'A', step: 'skipped', from: step });
        finish('home');
      }}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} testID="onboarding-screen">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg }}>
        <AppText tone="textMuted">
          Step {step === 'categories' ? 1 : step === 'budget' ? 2 : 3} of 3
        </AppText>
        {skip}
      </View>

      {step === 'categories' && (
        <Screen>
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            <AppText variant="title" weight="bold">
              What do you spend on?
            </AppText>
            <AppText tone="textMuted">
              Tap to hide categories you do not need. You can change these later.
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: space.sm }}>
            {expense.map((c) => (
              <View key={c.id} style={{ opacity: hidden.has(c.id) ? 0.35 : 1 }}>
                <CategoryChip
                  category={c}
                  selected={!hidden.has(c.id)}
                  onPress={() => {
                    const next = new Set(hidden);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    setHidden(next);
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ paddingHorizontal: space.lg }}>
            <Button
              testID="onboarding-next"
              label="Next"
              onPress={async () => {
                for (const id of hidden) await archive.mutateAsync({ id, archived: true });
                setStep('budget');
              }}
            />
          </View>
        </Screen>
      )}

      {step === 'budget' && (
        <Screen>
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            <AppText variant="title" weight="bold">
              Set your first budget
            </AppText>
            <AppText tone="textMuted">
              Pick one category to watch this month and give it a limit.
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: space.sm }}>
            {expense
              .filter((c) => !hidden.has(c.id))
              .map((c) => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={budgetCategory === c.id}
                  onPress={() => setBudgetCategory(c.id)}
                />
              ))}
          </View>
          <Field
            testID="onboarding-limit"
            label="Monthly limit"
            value={limit}
            onChangeText={(t) => {
              setLimit(t);
              setLimitError(undefined);
            }}
            keyboardType="decimal-pad"
            placeholder="400"
            error={limitError}
          />
          <View style={{ padding: space.lg, gap: space.md }}>
            <Button
              testID="onboarding-save-budget"
              label="Save budget"
              disabled={budgetCategory === null}
              onPress={() => {
                const parsed = budgetLimitSchema(
                  useUiStore.getState().numberFormat.decimal,
                ).safeParse(limit);
                if (!parsed.success || budgetCategory === null) {
                  setLimitError(parsed.error?.issues[0]?.message ?? 'Choose a category');
                  return;
                }
                setBudget.mutate(
                  {
                    categoryId: budgetCategory,
                    month: periodOf(toIsoDate(new Date()), useUiStore.getState().periodStartDay),
                    limitCents: parsed.data,
                  },
                  { onSuccess: () => setStep('done') },
                );
              }}
            />
            <TextLink label="Not now" onPress={() => setStep('done')} />
          </View>
        </Screen>
      )}

      {step === 'done' && (
        <View style={{ padding: space.lg, gap: space.lg }}>
          <AppText variant="title" weight="bold">
            You are set up
          </AppText>
          <AppText tone="textMuted">
            Everything you enter stays on this phone. Add what you spent today to see your numbers
            move.
          </AppText>
          <Button
            testID="onboarding-add-first"
            label="Add a transaction"
            onPress={() => finish('add')}
          />
          <Button label="Go to Home" variant="secondary" onPress={() => finish('home')} />
        </View>
      )}
    </SafeAreaView>
  );
}
