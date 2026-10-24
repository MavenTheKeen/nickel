import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  useCategories,
  useCategorizer,
  useRate,
  useRateFetcher,
  useSaveTransaction,
} from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { addDays, toIsoDate } from '@/services/dates';
import { formatShortDate } from '@/services/format';
import {
  centsToMinor,
  convertToHomeCents,
  currency as currencyInfo,
  formatMinor,
} from '@/services/fx';
import { centsToDecimalString } from '@/services/money';
import { fallbackCategory, parseQuickAdd } from '@/services/quickAdd';
import { font, radius, space, useTheme } from '@/theme/tokens';
import type { ForeignAmount } from '@/types/domain';
import { transactionSchema } from '@/types/schemas';

import { AppText } from './AppText';
import { CategoryIcon } from './CategoryChip';
import { MoneyText } from './MoneyText';
import { Button, TextLink } from './ui';

function dateText(date: string, today: string, locale: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  return formatShortDate(date, locale, Number(today.slice(0, 4)));
}

/**
 * One line to record a purchase: "12.50 groceries loblaws". The line under
 * the field shows how it was read before anything is saved. "€24 dinner"
 * is converted to the home currency at that day's rate.
 */
export function QuickAdd({ onAdded }: { onAdded?: (id: number, summary: string) => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const categories = useCategories(true);
  const categorizer = useCategorizer();
  const save = useSaveTransaction();
  const fetchRate = useRateFetcher();
  const { decimal } = useUiStore((s) => s.numberFormat);
  const symbol = useUiStore((s) => s.currencySymbol);
  const locale = useUiStore((s) => s.locale);
  const homeCurrency = useUiStore((s) => s.homeCurrency);
  const today = toIsoDate(new Date());

  const parsed = useMemo(
    () =>
      parseQuickAdd(text, {
        today,
        categories: categories.data ?? [],
        rules: categorizer.data?.rules ?? [],
        counts: categorizer.data?.counts ?? [],
        decimal,
        currencySymbol: symbol,
        homeCurrency,
      }),
    [text, today, categories.data, categorizer.data, decimal, symbol, homeCurrency],
  );
  const rate = useRate(parsed.currency, parsed.date);
  const all = categories.data ?? [];
  const category =
    all.find((c) => c.id === parsed.categoryId) ?? fallbackCategory(all, parsed.kind);
  const sign = parsed.kind === 'expense' ? -1 : 1;
  const decimals = parsed.currency ? (currencyInfo(parsed.currency)?.decimals ?? 2) : 2;
  const minor = parsed.amountCents === null ? null : centsToMinor(parsed.amountCents, decimals);
  const ready = minor !== null && category !== undefined;
  const previewCents =
    minor === null
      ? null
      : parsed.currency === null
        ? minor
        : rate.status === 'ready'
          ? convertToHomeCents(minor, rate.rate.rateMicros, decimals)
          : null;

  const submit = async () => {
    if (!ready || !category || minor === null) return;
    let amount = minor;
    let original: ForeignAmount | null = null;
    if (parsed.currency !== null) {
      setConverting(true);
      try {
        const r = await fetchRate(parsed.currency, parsed.date);
        amount = convertToHomeCents(minor, r.rateMicros, decimals);
        original = { minor: sign * minor, currency: parsed.currency, rateMicros: r.rateMicros };
      } catch {
        setError('No exchange rate available offline. Use More to enter the rate yourself.');
        return;
      } finally {
        setConverting(false);
      }
    }
    // The same schema as the form and the importer, so the rules match everywhere.
    const checked = transactionSchema(today).safeParse({
      amountCents: sign * amount,
      date: parsed.date,
      categoryId: category.id,
      merchant: parsed.merchant,
      note: '',
    });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'Check the entry');
      return;
    }
    save.mutate(
      { input: { ...checked.data, original }, source: 'quick_add' },
      {
        onSuccess: (id) => {
          setText('');
          onAdded?.(id, `Added to ${category.name}`);
        },
      },
    );
  };

  const openForm = () =>
    router.push({
      pathname: '/transaction',
      params: {
        amount: parsed.amountCents === null ? '' : centsToDecimalString(parsed.amountCents),
        kind: parsed.kind,
        categoryId: category ? String(category.id) : '',
        date: parsed.date,
        merchant: parsed.merchant,
        currency: parsed.currency ?? homeCurrency,
      },
    });

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput
          testID="quick-add-input"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          placeholder="12.50 groceries loblaws"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Quick add"
          accessibilityHint="Type an amount, and optionally a category, a merchant and a day"
          autoCorrect={false}
          style={{
            flex: 1,
            minHeight: 48,
            borderWidth: 1,
            borderColor: theme.rule,
            borderRadius: radius,
            paddingHorizontal: space.md,
            color: theme.text,
            fontSize: font.body,
          }}
        />
        <Button
          testID="quick-add-save"
          label="Add"
          onPress={() => void submit()}
          disabled={!ready}
          busy={save.isPending || converting}
          style={{ minWidth: 72 }}
        />
      </View>
      {error && (
        <AppText variant="small" tone="problem" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      )}
      {text.trim() !== '' && (
        <View
          testID="quick-add-preview"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 }}
        >
          {ready && category ? (
            <>
              <CategoryIcon category={category} size={24} />
              <AppText variant="small" style={{ flex: 1 }} numberOfLines={2}>
                {parsed.currency !== null && minor !== null && (
                  <>
                    {formatMinor(sign * minor, parsed.currency, locale)}
                    {previewCents === null
                      ? rate.status === 'error'
                        ? ' (no rate offline)'
                        : ' (getting rate)'
                      : ' ≈ '}
                  </>
                )}
                {previewCents !== null && (
                  <MoneyText variant="small" weight="medium" cents={sign * previewCents} signed />
                )}
                {` · ${category.name}`}
                {parsed.categoryId === null ? ' (no match)' : ''}
                {parsed.merchant ? ` · ${parsed.merchant}` : ''}
                {` · ${dateText(parsed.date, today, locale)}`}
              </AppText>
            </>
          ) : (
            <AppText variant="small" tone="textMuted" style={{ flex: 1 }}>
              {parsed.amountCents !== null && minor === null
                ? `${parsed.currency ?? ''} amounts have no decimals.`
                : 'Start with an amount, for example 12.50.'}
            </AppText>
          )}
          <TextLink label="More" onPress={openForm} testID="quick-add-more" />
        </View>
      )}
    </View>
  );
}
