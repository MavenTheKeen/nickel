import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { z } from 'zod';

import { AppText } from '@/components/AppText';
import { CategoryChip } from '@/components/CategoryChip';
import { Button, Field, Loading, Segmented } from '@/components/ui';
import { useCategories, useRuleMutations, useRules } from '@/hooks/queries';
import { addDays, parseIsoDate, toIsoDate } from '@/services/dates';
import { centsToDecimalString, parseMoneyInput } from '@/services/money';
import { useUiStore } from '@/hooks/uiStore';
import { space, useTheme } from '@/theme/tokens';
import type { Cadence, RecurringRule } from '@/types/domain';

const billSchema = (today: string) =>
  z.object({
    amount: z
      .string()
      .transform((s) => parseMoneyInput(s, useUiStore.getState().numberFormat.decimal))
      .refine((c): c is number => c !== null && c > 0, 'Enter an amount above zero'),
    anchorDate: z
      .string()
      .refine((d) => parseIsoDate(d) !== null, 'Enter a date as YYYY-MM-DD')
      .refine((d) => d >= addDays(today, -366), 'First due date is more than a year ago'),
    categoryId: z.number().int().positive('Choose a category'),
    name: z.string().trim().min(1, 'Give the bill a name').max(120),
  });

function BillForm({ rule }: { rule: RecurringRule | null }) {
  const theme = useTheme();
  const categories = useCategories();
  const { create, update, remove } = useRuleMutations();
  const today = toIsoDate(new Date());
  const [kind, setKind] = useState<'expense' | 'income'>(
    rule && rule.amountCents > 0 ? 'income' : 'expense',
  );
  const [amount, setAmount] = useState(
    rule ? centsToDecimalString(Math.abs(rule.amountCents)) : '',
  );
  const [cadence, setCadence] = useState<Cadence>(rule?.cadence ?? 'monthly');
  const [anchorDate, setAnchorDate] = useState(rule?.anchorDate ?? today);
  const [name, setName] = useState(rule?.merchant || rule?.note || '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!categories.data) return <Loading />;
  const visible = categories.data.filter((c) => c.isIncome === (kind === 'income'));

  const save = () => {
    const parsed = billSchema(today).safeParse({ amount, anchorDate, categoryId, name });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    const input = {
      amountCents: kind === 'expense' ? -parsed.data.amount : parsed.data.amount,
      categoryId: parsed.data.categoryId,
      cadence,
      anchorDate: parsed.data.anchorDate,
      merchant: parsed.data.name,
      note: '',
    };
    const done = { onSuccess: () => router.back() };
    if (rule) update.mutate({ id: rule.id, input }, done);
    else create.mutate(input, done);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: rule ? 'Edit bill' : 'Add bill' }} />
      <View style={{ marginTop: space.lg }}>
        <Segmented
          accessibilityLabel="Expense or income"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId(0);
          }}
          options={[
            { value: 'expense', label: 'Bill' },
            { value: 'income', label: 'Income' },
          ]}
        />
      </View>
      <Field
        testID="bill-name"
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Rent, phone, gym"
        error={errors.name}
      />
      <Field
        testID="bill-amount"
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errors.amount}
      />
      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginTop: space.lg, marginHorizontal: space.lg, marginBottom: space.xs }}
      >
        Repeats
      </AppText>
      <Segmented
        accessibilityLabel="Repeats"
        value={cadence}
        onChange={setCadence}
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
      />
      <Field
        testID="bill-date"
        label="First due date (YYYY-MM-DD)"
        value={anchorDate}
        onChangeText={setAnchorDate}
        autoCapitalize="none"
        error={errors.anchorDate}
      />
      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginHorizontal: space.lg, marginTop: space.xs }}
      >
        A bill due on the 29th to 31st falls on the last day of shorter months.
      </AppText>
      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginTop: space.lg, marginHorizontal: space.lg }}
      >
        Category
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.sm }}>
        {visible.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            selected={c.id === categoryId}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
      </View>
      {errors.categoryId && (
        <AppText variant="small" tone="problem" style={{ marginHorizontal: space.lg }}>
          {errors.categoryId}
        </AppText>
      )}
      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl, gap: space.md }}>
        <Button
          testID="bill-save"
          label="Save"
          onPress={save}
          busy={create.isPending || update.isPending}
        />
        {rule && (
          <Button
            label="Delete bill"
            variant="danger"
            onPress={() =>
              Alert.alert(
                'Delete this bill?',
                'Payments already recorded stay in your transactions.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => remove.mutate(rule.id, { onSuccess: () => router.back() }),
                  },
                ],
              )
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

export default function BillScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const rules = useRules();
  if (!rules.data) return <Loading />;
  const rule = params.id ? (rules.data.find((r) => r.id === Number(params.id)) ?? null) : null;
  return <BillForm rule={rule} />;
}
