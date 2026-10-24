import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button, Empty, Row, Rule, Screen, Section, Segmented, TextLink } from '@/components/ui';
import { track } from '@/events/track';
import { useBatches, useCategories, useCategorizer, useImport } from '@/hooks/queries';
import { parseCsv, type CsvParseResult } from '@/services/csv';
import {
  guessMapping,
  validateImport,
  type ColumnMapping,
  type DateFormat,
} from '@/services/csvImport';
import { toIsoDate } from '@/services/dates';
import { formatCents } from '@/services/money';
import { useUiStore } from '@/hooks/uiStore';
import { radius, space, useTheme } from '@/theme/tokens';

type ColumnField = 'date' | 'amount' | 'debit' | 'credit' | 'merchant' | 'note' | 'category';

const FIELD_LABELS: Record<ColumnField, string> = {
  date: 'Date',
  amount: 'Amount',
  debit: 'Debit (money out)',
  credit: 'Credit (money in)',
  merchant: 'Merchant',
  note: 'Note',
  category: 'Category',
};

const MAX_ERRORS_SHOWN = 200;

function ColumnPicker({
  field,
  headers,
  value,
  onChange,
  required,
}: {
  field: ColumnField;
  headers: readonly string[];
  value: number | null;
  onChange: (v: number | null) => void;
  required?: boolean;
}) {
  const theme = useTheme();
  const options: { index: number | null; label: string }[] = [
    ...(required ? [] : [{ index: null, label: 'None' }]),
    ...headers.map((h, i) => ({ index: i, label: h || `Column ${i + 1}` })),
  ];
  return (
    <View style={{ marginTop: space.md }}>
      <AppText
        variant="small"
        tone="textMuted"
        style={{ paddingHorizontal: space.lg, marginBottom: space.xs }}
      >
        {FIELD_LABELS[field]}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
      >
        {options.map((o) => {
          const selected = o.index === value;
          return (
            <Pressable
              key={String(o.index)}
              onPress={() => onChange(o.index)}
              accessibilityRole="button"
              accessibilityLabel={`${FIELD_LABELS[field]}: ${o.label}`}
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius,
                borderWidth: 1,
                borderColor: selected ? theme.brand : theme.rule,
                backgroundColor: selected ? theme.brand : 'transparent',
              }}
            >
              <AppText variant="small" style={{ color: selected ? theme.onBrand : theme.text }}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        marginTop: space.md,
      }}
    >
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export default function ImportScreen() {
  const theme = useTheme();
  const symbol = useUiStore((s) => s.currencySymbol);
  const categories = useCategories(true);
  const categorizer = useCategorizer();
  const batches = useBatches();
  const { run, undo } = useImport();
  const [file, setFile] = useState<{ name: string; parsed: CsvParseResult } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [done, setDone] = useState<{ batchId: number; rows: number } | null>(null);

  const pick = async () => {
    setPickError(null);
    setDone(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const text = await new File(asset.uri).text();
      const parsed = parseCsv(text);
      if (parsed.records.length === 0) {
        setPickError('The file is empty.');
        return;
      }
      setFile({ name: asset.name, parsed });
      setMapping(guessMapping(parsed.records[0]!.fields, parsed.records));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      track('import_failed', { reason: `read: ${message}` });
      setPickError(`Could not read the file: ${message}`);
    }
  };

  const validated = useMemo(() => {
    if (!file || !mapping || !categories.data) return null;
    const cats = categories.data;
    const fallbackExpense =
      cats.find((c) => !c.isIncome && !c.archived && c.name === 'Other') ??
      cats.find((c) => !c.isIncome && !c.archived);
    const fallbackIncome =
      cats.find((c) => c.isIncome && !c.archived && c.name === 'Other income') ??
      cats.find((c) => c.isIncome && !c.archived);
    if (!fallbackExpense || !fallbackIncome) return null;
    return validateImport(file.parsed.records, mapping, {
      categories: cats,
      fallbackExpenseCategoryId: fallbackExpense.id,
      fallbackIncomeCategoryId: fallbackIncome.id,
      today: toIsoDate(new Date()),
      rules: categorizer.data?.rules,
      counts: categorizer.data?.counts,
    });
  }, [file, mapping, categories.data, categorizer.data]);

  const headers = file
    ? mapping?.hasHeader
      ? file.parsed.records[0]!.fields
      : file.parsed.records[0]!.fields.map((_, i) => `Column ${i + 1}`)
    : [];
  const set = <K extends keyof ColumnMapping>(k: K, v: ColumnMapping[K]) =>
    mapping && setMapping({ ...mapping, [k]: v });

  return (
    <Screen testID="import-screen">
      <View style={{ padding: space.lg, gap: space.md }}>
        <AppText tone="textMuted">
          Choose a CSV export from your bank. Nothing is saved until you confirm, and a whole import
          can be undone.
        </AppText>
        <Button
          testID="pick-csv"
          label={file ? 'Choose a different file' : 'Choose CSV file'}
          onPress={pick}
        />
        {pickError && <AppText tone="problem">{pickError}</AppText>}
        {done && (
          <View style={{ gap: space.sm }} accessibilityLiveRegion="polite">
            <AppText weight="medium">Imported {done.rows} transactions.</AppText>
            <TextLink
              label="Undo this import"
              onPress={() => undo.mutate(done.batchId, { onSuccess: () => setDone(null) })}
            />
          </View>
        )}
      </View>

      {file && mapping && (
        <>
          <Rule inset={0} />
          <Section title="Columns">
            <AppText variant="small" tone="textMuted" style={{ paddingHorizontal: space.lg }}>
              {file.name} · {file.parsed.records.length} lines
            </AppText>
            {file.parsed.error && (
              <AppText tone="problem" style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>
                Line {file.parsed.error.line}: {file.parsed.error.message}. Rows after it were not
                read.
              </AppText>
            )}
            <ToggleRow
              label="First row is a header"
              value={mapping.hasHeader}
              onChange={(v) => set('hasHeader', v)}
            />
            <ColumnPicker
              field="date"
              headers={headers}
              value={mapping.date}
              onChange={(v) => set('date', v ?? 0)}
              required
            />
            <View style={{ marginTop: space.md }}>
              <AppText
                variant="small"
                tone="textMuted"
                style={{ paddingHorizontal: space.lg, marginBottom: space.xs }}
              >
                Date order
              </AppText>
              <Segmented<DateFormat>
                accessibilityLabel="Date order"
                value={mapping.dateFormat}
                onChange={(v) => set('dateFormat', v)}
                options={[
                  { value: 'YMD', label: 'Y-M-D' },
                  { value: 'MDY', label: 'M/D/Y' },
                  { value: 'DMY', label: 'D/M/Y' },
                ]}
              />
            </View>
            <ColumnPicker
              field="amount"
              headers={headers}
              value={mapping.amount}
              onChange={(v) =>
                setMapping({
                  ...mapping,
                  amount: v,
                  ...(v !== null ? { debit: null, credit: null } : {}),
                })
              }
            />
            {mapping.amount === null && (
              <>
                <ColumnPicker
                  field="debit"
                  headers={headers}
                  value={mapping.debit}
                  onChange={(v) => set('debit', v)}
                />
                <ColumnPicker
                  field="credit"
                  headers={headers}
                  value={mapping.credit}
                  onChange={(v) => set('credit', v)}
                />
              </>
            )}
            <ColumnPicker
              field="merchant"
              headers={headers}
              value={mapping.merchant}
              onChange={(v) => set('merchant', v)}
            />
            <ColumnPicker
              field="note"
              headers={headers}
              value={mapping.note}
              onChange={(v) => set('note', v)}
            />
            <ColumnPicker
              field="category"
              headers={headers}
              value={mapping.category}
              onChange={(v) => set('category', v)}
            />
            {mapping.amount !== null && (
              <ToggleRow
                label="Spending is shown as positive numbers"
                value={mapping.invertAmount}
                onChange={(v) => set('invertAmount', v)}
              />
            )}
            <ToggleRow
              label="Comma decimals (1.234,56)"
              value={mapping.decimal === ','}
              onChange={(v) => set('decimal', v ? ',' : '.')}
            />
          </Section>

          {validated && (
            <>
              <Section title="Preview">
                {validated.rows.length === 0 ? (
                  <Empty text="No valid rows with this mapping." />
                ) : (
                  validated.rows.slice(0, 5).map((r, i) => (
                    <View key={r.line}>
                      {i > 0 && <Rule />}
                      <Row
                        title={r.merchant || r.note || '(no description)'}
                        subtitle={`Line ${r.line} · ${r.date} · ${categories.data?.find((c) => c.id === r.categoryId)?.name ?? ''}`}
                        right={
                          <AppText style={{ color: r.amountCents > 0 ? theme.income : theme.text }}>
                            {formatCents(r.amountCents, { symbol, signed: true })}
                          </AppText>
                        }
                      />
                    </View>
                  ))
                )}
              </Section>

              <Section title="Validation">
                <View
                  style={{ paddingHorizontal: space.lg, gap: space.xs }}
                  testID="validation-report"
                >
                  <AppText>
                    {validated.rows.length} of {validated.total} rows are ready to import.
                  </AppText>
                  {validated.autoCategorized > 0 && (
                    <AppText tone="textMuted">
                      {validated.autoCategorized}{' '}
                      {validated.autoCategorized === 1 ? 'row was' : 'rows were'} filed by your
                      rules and past transactions.
                    </AppText>
                  )}
                  {validated.errors.length > 0 && (
                    <AppText tone="problem">
                      {validated.errors.length}{' '}
                      {validated.errors.length === 1 ? 'row has' : 'rows have'} problems and will be
                      skipped:
                    </AppText>
                  )}
                </View>
                {validated.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                  <View
                    key={e.line}
                    style={{
                      paddingHorizontal: space.lg,
                      paddingVertical: space.sm,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.rule,
                    }}
                  >
                    <AppText variant="small" weight="medium">
                      Line {e.line}: {e.message}
                    </AppText>
                    <AppText variant="small" tone="textMuted" numberOfLines={1}>
                      {e.raw}
                    </AppText>
                  </View>
                ))}
                {validated.errors.length > MAX_ERRORS_SHOWN && (
                  <AppText variant="small" tone="textMuted" style={{ padding: space.lg }}>
                    {validated.errors.length - MAX_ERRORS_SHOWN} more problem rows are not listed.
                  </AppText>
                )}
                <View style={{ padding: space.lg }}>
                  <Button
                    testID="confirm-import"
                    label={`Import ${validated.rows.length} transactions`}
                    disabled={validated.rows.length === 0}
                    busy={run.isPending}
                    onPress={() =>
                      run.mutate(
                        {
                          filename: file.name,
                          rows: validated.rows.map(({ line: _line, ...row }) => row),
                          errorCount: validated.errors.length,
                          totalRows: validated.total,
                        },
                        {
                          onSuccess: (batchId) => {
                            setDone({ batchId, rows: validated.rows.length });
                            setFile(null);
                            setMapping(null);
                          },
                        },
                      )
                    }
                  />
                  {run.isError && (
                    <AppText tone="problem">
                      Import failed: {run.error.message}. Nothing was saved.
                    </AppText>
                  )}
                </View>
              </Section>
            </>
          )}
        </>
      )}

      <Section title="Past imports">
        {!batches.data || batches.data.length === 0 ? (
          <Empty text="No imports yet." />
        ) : (
          batches.data.map((b, i) => (
            <View key={b.id}>
              {i > 0 && <Rule />}
              <Row
                title={b.filename}
                subtitle={`${b.importedAt.slice(0, 10)} · ${b.rowCount} rows, ${b.errorCount} skipped`}
                right={
                  <TextLink
                    label="Undo"
                    onPress={() =>
                      Alert.alert(
                        `Remove the ${b.rowCount} transactions from ${b.filename}?`,
                        undefined,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => undo.mutate(b.id),
                          },
                        ],
                      )
                    }
                  />
                }
              />
            </View>
          ))
        )}
      </Section>
    </Screen>
  );
}
