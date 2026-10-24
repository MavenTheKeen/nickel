import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Image, Platform, Pressable, ScrollView, View } from 'react-native';

import type { Categorizer } from '@/hooks/loaders';
import type { RateState } from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { useKeyboardScrollProps } from '@/platform/keyboard';
import { pickReceipt, receiptExists, receiptUri, type ReceiptSource } from '@/platform/receipts';
import { suggestCategory } from '@/services/merchant';
import { addDays, parseIsoDate, toIsoDate } from '@/services/dates';
import { formatShortDate } from '@/services/format';
import {
  centsToMinor,
  convertToHomeCents,
  currency as currencyInfo,
  formatMinor,
  formatRate,
  parseRate,
} from '@/services/fx';
import { centsToDecimalString, parseMoneyInput } from '@/services/money';
import type { ReceiptReading } from '@/services/receiptParse';
import { radius, space, useTheme } from '@/theme/tokens';
import type { Category, ForeignAmount, IsoDate, Transaction } from '@/types/domain';
import {
  MAX_AMOUNT_CENTS,
  transactionFormSchema,
  type TransactionFormValues,
  type TransactionInput,
} from '@/types/schemas';
import { zodResolver } from '@/types/zodResolver';

import { AppText } from './AppText';
import { CategoryChip } from './CategoryChip';
import { CurrencyPicker } from './CurrencyPicker';
import { MoneyText } from './MoneyText';
import { Button, Field, Segmented, TextLink } from './ui';

export type TransactionFormResult = TransactionInput & {
  receipt: string | null;
  /** Set when the amount was entered in a foreign currency. */
  original: ForeignAmount | null;
};

export interface TransactionFormProps {
  categories: readonly Category[];
  initial?: Transaction | null;
  /** Starting values for a new transaction, for example from quick add. */
  prefill?: Partial<TransactionFormValues> & { currency?: string };
  today: IsoDate;
  submitting?: boolean;
  onSubmit: (input: TransactionFormResult) => void;
  /** Opens a receipt photo full screen. */
  onOpenReceipt?: (name: string) => void;
  /** Rules and past filing, to suggest a category from the merchant. */
  categorizer?: Categorizer;
  /** Home currency code. Without it the form offers no other currencies. */
  homeCurrency?: string;
  /** The exchange rate for the currency and date the form reports through onCurrencyContext. */
  rate?: RateState;
  onCurrencyContext?: (currency: string, date: IsoDate) => void;
  /** Reads the total, date and shop from a receipt photo; absent where recognition is unavailable. */
  readReceipt?: (name: string) => Promise<ReceiptReading | null>;
}

/** Minor units back to the text a user would type: 2400 yen is "2400", 2400 cents "24.00". */
function minorToInput(minor: number, decimals: number): string {
  if (decimals === 0) return String(Math.abs(minor));
  return centsToDecimalString(Math.abs(minor) * 10 ** (2 - decimals));
}

function defaults(
  categories: readonly Category[],
  today: IsoDate,
  initial?: Transaction | null,
  prefill?: Partial<TransactionFormValues>,
): TransactionFormValues {
  if (initial) {
    const o = initial.original;
    return {
      amount: o
        ? minorToInput(o.minor, currencyInfo(o.currency)?.decimals ?? 2)
        : centsToDecimalString(Math.abs(initial.amountCents)),
      kind: initial.amountCents < 0 ? 'expense' : 'income',
      categoryId: initial.categoryId,
      date: initial.date,
      note: initial.note,
      merchant: initial.merchant,
    };
  }
  const kind = prefill?.kind ?? 'expense';
  const prefilled = categories.find((c) => c.id === prefill?.categoryId && !c.archived);
  return {
    amount: prefill?.amount ?? '',
    kind,
    categoryId:
      prefilled?.id ?? categories.find((c) => c.isIncome === (kind === 'income'))?.id ?? 0,
    date: prefill?.date ?? today,
    note: prefill?.note ?? '',
    merchant: prefill?.merchant ?? '',
  };
}

function ReceiptField({
  receipt,
  onChange,
  onOpen,
  onPicked,
}: {
  receipt: string | null;
  onChange: (r: string | null) => void;
  onOpen?: (name: string) => void;
  /** Called with a newly attached photo, to read it. */
  onPicked?: (name: string) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const pick = async (source: ReceiptSource) => {
    setBusy(true);
    try {
      const name = await pickReceipt(source);
      if (name) {
        onChange(name);
        onPicked?.(name);
      }
    } catch (e) {
      Alert.alert('Could not attach the photo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const exists = receipt !== null && receiptExists(receipt);
  return (
    <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
      <AppText variant="small" tone="textMuted" style={{ marginBottom: space.xs }}>
        Receipt (optional)
      </AppText>
      {receipt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {exists ? (
            <Pressable
              onPress={() => onOpen?.(receipt)}
              accessibilityRole="imagebutton"
              accessibilityLabel="Receipt photo"
              accessibilityHint="Opens the photo full screen"
            >
              <Image
                testID="receipt-thumbnail"
                source={{ uri: receiptUri(receipt) }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: radius,
                  borderWidth: 1,
                  borderColor: theme.rule,
                }}
              />
            </Pressable>
          ) : (
            <AppText tone="textMuted" style={{ flex: 1 }}>
              The photo is not on this device (backups do not include photos).
            </AppText>
          )}
          <TextLink label="Remove photo" onPress={() => onChange(null)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label="Take photo"
            variant="secondary"
            busy={busy}
            onPress={() => void pick('camera')}
            style={{ flex: 1 }}
          />
          <Button
            label="Choose photo"
            variant="secondary"
            disabled={busy}
            onPress={() => void pick('library')}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

/**
 * The common case takes three taps: type the amount, pick a category, save.
 * Validation messages come from the shared Zod schema.
 */
export function TransactionForm({
  categories,
  initial,
  prefill,
  today,
  submitting,
  onSubmit,
  onOpenReceipt,
  categorizer,
  homeCurrency,
  rate,
  onCurrencyContext,
  readReceipt,
}: TransactionFormProps) {
  const theme = useTheme();
  const decimal = useUiStore((st) => st.numberFormat.decimal);
  const locale = useUiStore((st) => st.locale);
  const schema = useMemo(() => transactionFormSchema(today, decimal), [today, decimal]);
  const { control, handleSubmit, setValue, formState } = useForm<
    TransactionFormValues,
    unknown,
    TransactionInput
  >({
    defaultValues: defaults(categories, today, initial, prefill),
    resolver: zodResolver(schema, { amountCents: 'amount' }),
  });
  const [showPicker, setShowPicker] = useState(false);
  const kind = useWatch({ control, name: 'kind' });
  const date = useWatch({ control, name: 'date' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const merchant = useWatch({ control, name: 'merchant' });
  const [receipt, setReceipt] = useState<string | null>(initial?.receipt ?? null);
  const amountText = useWatch({ control, name: 'amount' });

  // Currency: the home currency unless the user picks another. An existing
  // foreign transaction keeps the rate it was recorded at unless changed.
  const home = homeCurrency ?? 'USD';
  const [currency, setCurrency] = useState(
    initial?.original?.currency ?? prefill?.currency ?? home,
  );
  const [showCurrencies, setShowCurrencies] = useState(currency !== home);
  const [manualRate, setManualRate] = useState(
    initial?.original ? formatRate(initial.original.rateMicros) : '',
  );
  const [fxError, setFxError] = useState<string | null>(null);
  const foreign = homeCurrency !== undefined && currency !== home;
  useEffect(() => {
    if (foreign) onCurrencyContext?.(currency, date);
  }, [foreign, currency, date, onCurrencyContext]);
  const manualMicros = manualRate.trim() === '' ? null : parseRate(manualRate);
  const fetchedMicros = rate?.status === 'ready' ? rate.rate.rateMicros : null;
  const rateMicros = manualMicros ?? fetchedMicros;
  const decimals = currencyInfo(currency)?.decimals ?? 2;
  const typedCents = parseMoneyInput(amountText, decimal);
  const typedMinor = typedCents === null ? null : centsToMinor(Math.abs(typedCents), decimals);
  const convertedCents =
    foreign && typedMinor !== null && rateMicros !== null
      ? convertToHomeCents(typedMinor, rateMicros, decimals)
      : null;

  // Receipt reading: offered, never applied without a tap.
  const [reading, setReading] = useState<ReceiptReading | null>(null);
  const read = (name: string) => {
    if (!readReceipt) return;
    readReceipt(name)
      .then((r) => setReading(r && (r.totalCents || r.date || r.merchant) ? r : null))
      .catch(() => setReading(null));
  };
  const applyReading = (r: ReceiptReading) => {
    if (r.totalCents) setValue('amount', centsToDecimalString(r.totalCents));
    if (r.date) setValue('date', r.date);
    if (r.merchant && merchant.trim() === '') setValue('merchant', r.merchant);
    setReading(null);
  };

  const submit = (input: TransactionInput) => {
    if (!foreign) return onSubmit({ ...input, receipt, original: null });
    if (manualRate.trim() !== '' && manualMicros === null) {
      return setFxError('Enter the rate as a number, such as 1.4932');
    }
    if (rateMicros === null) {
      return setFxError(
        rate?.status === 'loading'
          ? 'Waiting for the exchange rate'
          : 'Enter the exchange rate to save',
      );
    }
    const minor = centsToMinor(Math.abs(input.amountCents), decimals);
    if (minor === null) return setFxError(`${currency} amounts have no decimals`);
    const cents = convertToHomeCents(minor, rateMicros, decimals);
    if (cents === 0) return setFxError(`That is less than one cent in ${home}`);
    if (cents > MAX_AMOUNT_CENTS) return setFxError('Amount is too large');
    const sign = input.amountCents < 0 ? -1 : 1;
    setFxError(null);
    onSubmit({
      ...input,
      amountCents: sign * cents,
      receipt,
      original: { minor: sign * minor, currency, rateMicros },
    });
  };

  // Suggest a category from the merchant until the user picks one themselves.
  const [picked, setPicked] = useState(initial != null || prefill?.categoryId != null);
  const suggestion = useMemo(() => {
    if (picked || !categorizer) return null;
    const s = suggestCategory(merchant, categorizer.rules, categorizer.counts);
    const cat = s && categories.find((c) => c.id === s.categoryId);
    return s && cat && !cat.archived && cat.isIncome === (kind === 'income') ? s : null;
  }, [picked, merchant, kind, categorizer, categories]);
  const suggestedBy = suggestion?.source ?? null;
  useEffect(() => {
    if (suggestion) setValue('categoryId', suggestion.categoryId);
  }, [suggestion, setValue]);
  const visible = categories.filter(
    (c) => c.isIncome === (kind === 'income') && (!c.archived || c.id === categoryId),
  );
  const errors = formState.errors;

  const setKind = (k: 'expense' | 'income') => {
    setValue('kind', k);
    const current = categories.find((c) => c.id === categoryId);
    if (!current || current.isIncome !== (k === 'income')) {
      setValue(
        'categoryId',
        categories.find((c) => c.isIncome === (k === 'income') && !c.archived)?.id ?? 0,
      );
    }
  };

  const quickDates: { label: string; value: IsoDate }[] = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
  ];
  const dateIsQuick = quickDates.some((q) => q.value === date);
  const keyboardScroll = useKeyboardScrollProps(space.xxl);

  return (
    <ScrollView {...keyboardScroll}>
      <View style={{ marginTop: space.lg }}>
        <Segmented
          accessibilityLabel="Expense or income"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
      </View>

      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <Field
            testID="amount-input"
            label="Amount"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="decimal-pad"
            placeholder="0.00"
            autoFocus={!initial}
            error={errors.amount?.message}
            style={{ fontSize: 28, minHeight: 56 }}
          />
        )}
      />

      {homeCurrency !== undefined && (
        <View style={{ marginTop: space.sm, gap: space.sm }}>
          {showCurrencies ? (
            <CurrencyPicker
              label="Currency"
              value={currency}
              first={home}
              onChange={(c) => {
                setCurrency(c);
                setManualRate('');
                setFxError(null);
              }}
            />
          ) : (
            <View style={{ paddingHorizontal: space.lg }}>
              <TextLink
                testID="other-currency"
                label={`Paid in another currency? (${home})`}
                onPress={() => setShowCurrencies(true)}
              />
            </View>
          )}
          {foreign && (
            <View
              testID="fx-summary"
              accessibilityLiveRegion="polite"
              style={{ paddingHorizontal: space.lg, gap: space.xs }}
            >
              {convertedCents !== null && (
                <AppText>
                  ={' '}
                  <MoneyText
                    cents={convertedCents * (kind === 'expense' ? -1 : 1)}
                    signed
                    weight="bold"
                  />{' '}
                  in {home}
                </AppText>
              )}
              <AppText variant="small" tone="textMuted">
                {manualMicros !== null
                  ? `At your rate of ${formatRate(manualMicros)} ${home} per ${currency}`
                  : initial?.original && manualRate !== ''
                    ? 'At the rate it was recorded with'
                    : rate?.status === 'ready'
                      ? `1 ${currency} = ${formatRate(rate.rate.rateMicros)} ${home}, ${
                          rate.rate.source === 'offline'
                            ? `the newest stored rate (${rate.rate.rateDate}); you are offline`
                            : `rate for ${formatShortDate(rate.rate.rateDate, locale, Number(today.slice(0, 4)))} from Frankfurter`
                        }`
                      : rate?.status === 'error'
                        ? `${rate.message}. Enter the rate below.`
                        : 'Getting the exchange rate…'}
              </AppText>
              {(rate?.status === 'error' || manualRate !== '' || rate?.status === 'ready') && (
                <Field
                  testID="fx-rate"
                  label={`Rate: ${home} for 1 ${currency} (optional${rate?.status === 'error' ? ', needed offline' : ''})`}
                  value={manualRate}
                  onChangeText={(t) => {
                    setManualRate(t);
                    setFxError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={fetchedMicros ? formatRate(fetchedMicros) : '1.0000'}
                />
              )}
              {typedMinor !== null && (
                <AppText variant="small" tone="textMuted">
                  Paid {formatMinor(typedMinor, currency, locale)}
                </AppText>
              )}
              {fxError && (
                <AppText variant="small" tone="problem" accessibilityLiveRegion="polite">
                  {fxError}
                </AppText>
              )}
            </View>
          )}
        </View>
      )}

      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginTop: space.lg, marginHorizontal: space.lg }}
      >
        Category
      </AppText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Category"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: space.sm,
          marginTop: space.xs,
        }}
      >
        {visible.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            selected={c.id === categoryId}
            onPress={() => {
              setPicked(true);
              setValue('categoryId', c.id);
            }}
          />
        ))}
      </View>
      {suggestedBy && (
        <AppText
          testID="category-suggestion"
          variant="small"
          tone="textMuted"
          style={{ marginHorizontal: space.lg }}
          accessibilityLiveRegion="polite"
        >
          {suggestedBy === 'rule'
            ? 'Chosen by a rule for this merchant.'
            : 'Chosen from past transactions at this merchant.'}
        </AppText>
      )}
      {errors.categoryId?.message ? (
        <AppText variant="small" tone="problem" style={{ marginHorizontal: space.lg }}>
          {errors.categoryId.message}
        </AppText>
      ) : null}

      <AppText
        variant="small"
        tone="textMuted"
        style={{ marginTop: space.lg, marginHorizontal: space.lg }}
      >
        Date
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          marginTop: space.xs,
        }}
      >
        {quickDates.map((q) => (
          <Button
            key={q.label}
            label={q.label}
            variant={date === q.value ? 'primary' : 'secondary'}
            onPress={() => setValue('date', q.value)}
            style={{ flex: 1 }}
          />
        ))}
        <Button
          label={dateIsQuick ? 'Other date' : date}
          variant={dateIsQuick ? 'secondary' : 'primary'}
          onPress={() => setShowPicker(true)}
          style={{ flex: 1 }}
          accessibilityHint="Opens a date picker"
        />
      </View>
      {errors.date?.message ? (
        <AppText
          variant="small"
          tone="problem"
          style={{ marginHorizontal: space.lg, marginTop: space.xs }}
        >
          {errors.date.message}
        </AppText>
      ) : null}
      {showPicker && (
        <DateTimePicker
          value={(() => {
            const p = parseIsoDate(date);
            return p ? new Date(p.y, p.m - 1, p.d) : new Date();
          })()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, picked) => {
            setShowPicker(Platform.OS === 'ios');
            if (event.type === 'set' && picked) setValue('date', toIsoDate(picked));
            if (event.type === 'dismissed') setShowPicker(false);
          }}
        />
      )}

      <Controller
        control={control}
        name="merchant"
        render={({ field }) => (
          <Field
            label="Merchant (optional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="Where"
            error={errors.merchant?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="note"
        render={({ field }) => (
          <Field
            label="Note (optional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="What for"
            error={errors.note?.message}
          />
        )}
      />

      <ReceiptField
        receipt={receipt}
        onChange={(r) => {
          setReceipt(r);
          if (r === null) setReading(null);
        }}
        onOpen={onOpenReceipt}
        onPicked={readReceipt ? read : undefined}
      />
      {reading && (
        <View
          testID="receipt-reading"
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: space.lg,
            marginTop: space.md,
            padding: space.md,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: theme.brand,
            gap: space.sm,
          }}
        >
          <AppText weight="medium">Read from the receipt</AppText>
          <AppText tone="textMuted">
            {[
              reading.totalCents ? `Total ${centsToDecimalString(reading.totalCents)}` : null,
              reading.date
                ? formatShortDate(reading.date, locale, Number(today.slice(0, 4)))
                : null,
              reading.merchant,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xl }}>
            <TextLink
              label="Use these"
              onPress={() => applyReading(reading)}
              testID="use-reading"
            />
            <TextLink label="Ignore" onPress={() => setReading(null)} />
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <Button
          testID="save-transaction"
          label={initial ? 'Save changes' : 'Save'}
          busy={submitting}
          onPress={handleSubmit(submit)}
        />
      </View>
    </ScrollView>
  );
}
