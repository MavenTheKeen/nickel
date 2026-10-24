import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { z } from 'zod';

import { AppearancePicker } from '@/components/AppearancePicker';
import { AppText } from '@/components/AppText';
import { CATEGORY_COLORS } from '@/components/CategoryChip';
import { GoalRow } from '@/components/GoalRow';
import { MoneyText } from '@/components/MoneyText';
import { Button, Empty, Field, Loading, Row, Rule, Section, Segmented } from '@/components/ui';
import { useContributions, useGoal, useGoalMutations } from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { addDays, parseIsoDate, toIsoDate } from '@/services/dates';
import { formatShortDate } from '@/services/format';
import { centsToDecimalString, parseMoneyInput } from '@/services/money';
import { space, useTheme } from '@/theme/tokens';
import type { Goal } from '@/types/domain';
import { MAX_AMOUNT_CENTS } from '@/types/schemas';

const amountSchema = (decimal: '.' | ',') =>
  z
    .string()
    .transform((s) => parseMoneyInput(s, decimal))
    .refine((c): c is number => c !== null && c > 0, 'Enter an amount above zero')
    .refine((c) => c <= MAX_AMOUNT_CENTS, 'Amount is too large');

function GoalForm({ goal }: { goal: Goal | null }) {
  const { create, update } = useGoalMutations();
  const decimal = useUiStore((s) => s.numberFormat.decimal);
  const locale = useUiStore((s) => s.locale);
  const today = toIsoDate(new Date());
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? centsToDecimalString(goal.targetCents) : '');
  const [targetDate, setTargetDate] = useState<string | null>(goal?.targetDate ?? null);
  const [showPicker, setShowPicker] = useState(false);
  const [color, setColor] = useState<string>(goal?.color ?? CATEGORY_COLORS[2]);
  const [icon, setIcon] = useState<string>(goal?.icon ?? 'piggy-bank');
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});

  const save = () => {
    const trimmed = name.trim();
    const amount = amountSchema(decimal).safeParse(target);
    const next = {
      name:
        trimmed === ''
          ? 'Give the goal a name'
          : trimmed.length > 60
            ? 'Name is longer than 60 characters'
            : undefined,
      target: amount.success ? undefined : amount.error.issues[0]?.message,
    };
    setErrors(next);
    if (next.name || next.target || !amount.success) return;
    const input = { name: trimmed, targetCents: amount.data, targetDate, color, icon };
    const done = { onSuccess: () => router.back() };
    if (goal) update.mutate({ id: goal.id, input }, done);
    else create.mutate(input, done);
  };

  const pickerValue = (() => {
    const p = parseIsoDate(targetDate ?? addDays(today, 180));
    return p ? new Date(p.y, p.m - 1, p.d) : new Date();
  })();

  return (
    <View>
      <Field
        testID="goal-name"
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Emergency fund"
        error={errors.name}
      />
      <Field
        testID="goal-target"
        label="Target amount"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errors.target}
      />
      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginTop: space.lg, marginHorizontal: space.lg }}
      >
        Target date (optional)
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          marginTop: space.xs,
        }}
      >
        <Button
          label={targetDate ? formatShortDate(targetDate, locale, 0) : 'Choose a date'}
          variant={targetDate ? 'primary' : 'secondary'}
          onPress={() => setShowPicker(true)}
          style={{ flex: 1 }}
          accessibilityHint="Opens a date picker"
        />
        {targetDate && (
          <Button
            label="No date"
            variant="secondary"
            onPress={() => setTargetDate(null)}
            style={{ flex: 1 }}
          />
        )}
      </View>
      {showPicker && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          minimumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, picked) => {
            setShowPicker(Platform.OS === 'ios');
            if (event.type === 'set' && picked) setTargetDate(toIsoDate(picked));
            if (event.type === 'dismissed') setShowPicker(false);
          }}
        />
      )}
      <AppearancePicker color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <Button
          testID="goal-save"
          label={goal ? 'Save changes' : 'Create goal'}
          onPress={save}
          busy={create.isPending || update.isPending}
        />
      </View>
    </View>
  );
}

function MoneyMover({ goal }: { goal: Goal }) {
  const { contribute } = useGoalMutations();
  const decimal = useUiStore((s) => s.numberFormat.decimal);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const submit = () => {
    const parsed = amountSchema(decimal).safeParse(amount);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (direction === 'out' && parsed.data > Math.max(0, goal.savedCents)) {
      setError('That is more than the goal holds');
      return;
    }
    contribute.mutate(
      { goalId: goal.id, amountCents: direction === 'in' ? parsed.data : -parsed.data },
      { onSuccess: () => setAmount('') },
    );
  };
  return (
    <View style={{ gap: space.sm }}>
      <Segmented
        accessibilityLabel="Add or take out"
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setError(undefined);
        }}
        options={[
          { value: 'in', label: 'Add money' },
          { value: 'out', label: 'Take out' },
        ]}
      />
      <Field
        testID="goal-amount"
        label={direction === 'in' ? 'Amount set aside' : 'Amount taken out'}
        value={amount}
        onChangeText={(t) => {
          setAmount(t);
          setError(undefined);
        }}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={error}
        onSubmitEditing={submit}
      />
      <View style={{ paddingHorizontal: space.lg }}>
        <Button
          testID="goal-contribute"
          label={direction === 'in' ? 'Add' : 'Take out'}
          onPress={submit}
          busy={contribute.isPending}
        />
      </View>
      <AppText variant="small" tone="textMuted" style={{ paddingHorizontal: space.lg }}>
        Goals track money you set aside, for example in a savings account. They do not change your
        spending or budgets.
      </AppText>
    </View>
  );
}

export default function GoalScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const goal = useGoal(id);
  const contributions = useContributions(id);
  const { archive, remove, removeContribution } = useGoalMutations();
  const [editing, setEditing] = useState(false);
  const locale = useUiStore((s) => s.locale);
  const today = toIsoDate(new Date());

  if (id !== null && (goal.isLoading || !goal.data)) return <Loading rows={3} />;
  const g = goal.data ?? null;

  if (!g || editing) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: g ? 'Edit goal' : 'New goal' }} />
        <GoalForm goal={g} />
      </ScrollView>
    );
  }

  const confirmDelete = () =>
    Alert.alert(
      'Delete this goal?',
      'Its history is deleted too. Archive it to keep the history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => remove.mutate(g.id, { onSuccess: () => router.back() }),
        },
      ],
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: g.name }} />
      <View style={{ paddingTop: space.md }}>
        <GoalRow goal={g} today={today} />
      </View>
      {!g.archived && <MoneyMover goal={g} />}
      <Section title="History">
        {(contributions.data ?? []).length === 0 ? (
          <Empty icon="history" text="Money you add or take out appears here." />
        ) : (
          (contributions.data ?? []).map((c, i) => (
            <View key={c.id}>
              {i > 0 && <Rule />}
              <Row
                title={c.amountCents > 0 ? 'Added' : 'Taken out'}
                subtitle={[formatShortDate(c.date, locale, Number(today.slice(0, 4))), c.note]
                  .filter(Boolean)
                  .join(' · ')}
                right={<MoneyText cents={c.amountCents} signed />}
                onLongPress={() =>
                  Alert.alert('Remove this entry?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => removeContribution.mutate(c.id),
                    },
                  ])
                }
                accessibilityHint="Long press to remove"
              />
            </View>
          ))
        )}
      </Section>
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Button label="Edit goal" variant="secondary" onPress={() => setEditing(true)} />
        <Button
          label={g.archived ? 'Restore goal' : 'Archive goal'}
          variant="secondary"
          onPress={() => archive.mutate({ id: g.id, archived: !g.archived })}
        />
        <Button label="Delete goal" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}
