import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { TransactionForm, type TransactionFormResult } from '@/components/TransactionForm';
import { Button, Loading } from '@/components/ui';
import { useDb } from '@/db/DbProvider';
import { countRuleMatches } from '@/db/repositories/categoryRules';
import {
  useCategories,
  useCategorizer,
  useCategoryRuleMutations,
  useDeleteTransaction,
  useRate,
  useSaveTransaction,
  useTransaction,
} from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { receiptUri } from '@/platform/receipts';
import { canReadReceipts, readReceiptText } from '@/platform/receiptText';
import { isDayFirst } from '@/services/format';
import { matchRule, merchantKey, suggestCategory, titleCase } from '@/services/merchant';
import { parseReceipt } from '@/services/receiptParse';
import { toIsoDate } from '@/services/dates';
import { space, useTheme } from '@/theme/tokens';
import type { Category } from '@/types/domain';

type Params = {
  id?: string;
  amount?: string;
  kind?: string;
  categoryId?: string;
  date?: string;
  merchant?: string;
  currency?: string;
};

export default function TransactionScreen() {
  const theme = useTheme();
  const db = useDb();
  const params = useLocalSearchParams<Params>();
  const id = params.id ? Number(params.id) : null;
  const existing = useTransaction(id);
  const categories = useCategories(true);
  const categorizer = useCategorizer();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const { save: saveRule } = useCategoryRuleMutations();
  const homeCurrency = useUiStore((s) => s.homeCurrency);
  const locale = useUiStore((s) => s.locale);
  const today = toIsoDate(new Date());
  const [fxContext, setFxContext] = useState<{ currency: string; date: string } | null>(null);
  const rate = useRate(fxContext?.currency ?? null, fxContext?.date ?? today);
  const onCurrencyContext = useCallback(
    (currency: string, date: string) => setFxContext({ currency, date }),
    [],
  );

  if (!categories.data || (id !== null && existing.isLoading)) return <Loading />;
  const cats = categories.data;

  const confirmDelete = () => {
    if (id === null) return;
    Alert.alert('Delete this transaction?', 'This cannot be undone from here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  /**
   * After the user files a merchant somewhere other than where Nickel would
   * have put it, offer a rule so it happens automatically next time.
   */
  const offerRule = async (input: TransactionFormResult) => {
    const key = merchantKey(input.merchant);
    const rules = categorizer.data?.rules ?? [];
    const counts = categorizer.data?.counts ?? [];
    if (key === '' || matchRule(input.merchant, rules)?.categoryId === input.categoryId) return;
    const before = existing.data;
    const changed = before ? before.categoryId !== input.categoryId : false;
    const suggested = suggestCategory(input.merchant, rules, counts);
    const overrode = !before && suggested !== null && suggested.categoryId !== input.categoryId;
    if (!changed && !overrode) return;
    const category: Category | undefined = cats.find((c) => c.id === input.categoryId);
    if (!category) return;
    const others = await countRuleMatches(db, key, input.categoryId).catch(() => 0);
    const name = titleCase(key);
    const make = (applyToHistory: boolean) =>
      saveRule.mutate({ pattern: key, categoryId: input.categoryId, applyToHistory });
    Alert.alert(
      `Always file ${name} under ${category.name}?`,
      others > 0
        ? `${others} earlier ${others === 1 ? 'transaction is' : 'transactions are'} filed elsewhere.`
        : 'New transactions from this merchant will go there automatically.',
      [
        { text: 'Not now', style: 'cancel' },
        ...(others > 0
          ? [
              { text: 'Make rule', onPress: () => make(false) },
              { text: `Make rule and move ${others}`, onPress: () => make(true) },
            ]
          : [{ text: 'Make rule', onPress: () => make(false) }]),
      ],
    );
  };

  const prefill =
    id === null
      ? {
          amount: params.amount,
          kind: params.kind === 'income' ? ('income' as const) : ('expense' as const),
          categoryId: params.categoryId ? Number(params.categoryId) : undefined,
          date: params.date,
          merchant: params.merchant,
          currency: params.currency,
        }
      : undefined;

  // On-device text recognition, where the build includes it (not Expo Go).
  const readReceipt = canReadReceipts()
    ? async (name: string) => {
        const lines = await readReceiptText(receiptUri(name));
        return lines ? parseReceipt(lines, { today, dayFirst: isDayFirst(locale) }) : null;
      }
    : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: id === null ? 'Add transaction' : 'Edit transaction' }} />
      <TransactionForm
        categories={cats}
        initial={existing.data ?? null}
        prefill={prefill}
        today={today}
        homeCurrency={homeCurrency}
        rate={rate}
        onCurrencyContext={onCurrencyContext}
        readReceipt={readReceipt}
        submitting={save.isPending}
        categorizer={categorizer.data}
        onOpenReceipt={(name) => router.push({ pathname: '/receipt', params: { name } })}
        onSubmit={(input) =>
          save.mutate(
            { input, id: id ?? undefined },
            {
              onSuccess: () => {
                router.back();
                void offerRule(input);
              },
            },
          )
        }
      />
      {id !== null && (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
          <Button label="Delete transaction" variant="danger" onPress={confirmDelete} />
        </View>
      )}
    </View>
  );
}
