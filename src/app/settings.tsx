import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Updates from 'expo-updates';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { Button, Loading, Row, Rule, Screen, Section } from '@/components/ui';
import { countRows, createBackup, parseBackup, restoreBackup } from '@/db/backup';
import { useDb } from '@/db/DbProvider';
import { getSchemaVersion } from '@/db/migrate';
import { listCategories } from '@/db/repositories/categories';
import { getSettings, type Settings } from '@/db/repositories/settings';
import { allTransactions } from '@/db/repositories/transactions';
import { rescheduleNotifications } from '@/hooks/actions';
import { useAppContext } from '@/hooks/AppContext';
import { keys, useSettings, useUpdateSettings } from '@/hooks/queries';
import { shareTextFile } from '@/hooks/shareFile';
import { useUiStore } from '@/hooks/uiStore';
import { requestNotificationPermission } from '@/notifications/scheduler';
import { authAvailability, authenticate } from '@/platform/biometrics';
import { useAppLock } from '@/security/AppLockGate';
import { crashReportingAvailable, setCrashReportingConsent } from '@/monitoring/sentry';
import { transactionsToCsv } from '@/services/csvExport';
import { clampStartDay, MAX_PERIOD_START_DAY, toIsoDate } from '@/services/dates';
import { currencySymbolFor } from '@/services/format';
import { space } from '@/theme/tokens';
import { refreshWidget } from '@/widget/widget';

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: space.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
        <AppText variant="small" tone="textMuted">
          {hint}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export default function SettingsScreen() {
  const db = useDb();
  const settings = useSettings();
  const update = useUpdateSettings();
  const setCurrencySymbol = useUiStore((s) => s.setCurrencySymbol);
  const locale = useUiStore((s) => s.locale);
  const appLock = useAppLock();
  const qc = useQueryClient();
  const { effects } = useAppContext();
  const { isUpdatePending } = Updates.useUpdates();
  const [message, setMessage] = useState<string | null>(null);

  if (!settings.data) return <Loading />;
  const s = settings.data;

  const toggle =
    (key: keyof Pick<Settings, 'notifyBills' | 'notifyBudget' | 'notifyWeekly'>) =>
    async (value: boolean) => {
      if (value && !(await requestNotificationPermission())) {
        setMessage('Notifications are turned off for Nickel in system settings.');
        return;
      }
      setMessage(null);
      update.mutate({ [key]: value });
    };

  const toggleLock = async (value: boolean) => {
    if (value && (await authAvailability()) === 'none') {
      setMessage('Set a screen lock on this device first, then turn on the app lock.');
      return;
    }
    // Confirm it works before relying on it, and before turning it off.
    const result = await authenticate(value ? 'Turn on app lock' : 'Turn off app lock');
    if (!result.ok) return;
    setMessage(null);
    update.mutate({ appLock: value }, { onSuccess: () => appLock.setEnabled(value) });
  };

  const exportCsv = async () => {
    try {
      const [txs, cats] = await Promise.all([
        allTransactions(db),
        listCategories(db, { includeArchived: true }),
      ]);
      await shareTextFile(
        `nickel-${toIsoDate(new Date())}.csv`,
        transactionsToCsv(txs, cats),
        'text/csv',
      );
      setMessage(`Exported ${txs.length} transactions.`);
    } catch (e) {
      setMessage(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const setStartDay = (day: number) => {
    const next = clampStartDay(day);
    useUiStore.getState().setPeriodStartDay(next);
    update.mutate({ periodStartDay: next });
  };

  const backUp = async () => {
    try {
      const backup = await createBackup(db);
      await shareTextFile(
        `nickel-backup-${toIsoDate(new Date())}.json`,
        JSON.stringify(backup),
        'application/json',
      );
      setMessage(
        `Backed up ${backup.tables.transactions.length} transactions. Keep the file somewhere safe: it is not encrypted.`,
      );
    } catch (e) {
      setMessage(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restore = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const backup = parseBackup(
        await new File(picked.assets[0].uri).text(),
        await getSchemaVersion(db),
      );
      const counts = countRows(backup);
      Alert.alert(
        'Replace all data?',
        `This replaces everything in Nickel with the backup from ${backup.exportedAt.slice(0, 10)}: ${counts.transactions} transactions, ${counts.categories} categories, ${counts.recurring_rules} bills, ${counts.budgets} budgets and ${counts.goals} goals. Receipt photos are not part of a backup.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, backup);
                const restored = await getSettings(db);
                setCurrencySymbol(restored.currencySymbol);
                setCrashReportingConsent(restored.crashReports);
                useUiStore.getState().setPeriodStartDay(restored.periodStartDay);
                appLock.setEnabled(restored.appLock);
                await rescheduleNotifications(db, effects, toIsoDate(new Date())).catch(() => null);
                refreshWidget(db);
                await qc.invalidateQueries({ queryKey: keys.all });
                setMessage(`Restored ${counts.transactions} transactions.`);
              } catch (e) {
                setMessage(
                  `Restore failed, nothing was changed: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
            },
          },
        ],
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen testID="settings-screen">
      {isUpdatePending && (
        <View style={{ padding: space.lg, gap: space.sm }}>
          <AppText weight="medium">A new version has been downloaded.</AppText>
          <Button label="Restart to update" onPress={() => void Updates.reloadAsync()} />
        </View>
      )}

      <Section title="Home currency">
        <CurrencyPicker
          label="Home currency"
          value={s.homeCurrency}
          onChange={(code) => {
            if (code === s.homeCurrency) return;
            const apply = () => {
              const symbol = currencySymbolFor(code, locale);
              setCurrencySymbol(symbol);
              useUiStore.getState().setHomeCurrency(code);
              update.mutate({ homeCurrency: code, currencySymbol: symbol });
            };
            Alert.alert(
              `Keep amounts in ${code}?`,
              'Amounts already recorded are not converted; only their symbol changes. Purchases in other currencies are converted to the home currency when you record them.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: `Use ${code}`, onPress: apply },
              ],
            );
          }}
        />
        <AppText
          variant="small"
          tone="textMuted"
          style={{ paddingHorizontal: space.lg, marginTop: space.sm }}
        >
          Exchange rates for other currencies come from Frankfurter (api.frankfurter.dev). Only the
          two currency codes and the date are sent, and each rate is stored so it is downloaded
          once.
        </AppText>
      </Section>

      <Section title="Budget period">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: space.lg,
            gap: space.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText>Budgets reset on day {s.periodStartDay}</AppText>
            <AppText variant="small" tone="textMuted">
              {s.periodStartDay === 1
                ? 'Calendar months'
                : `Each period runs from the ${s.periodStartDay}th to the day before`}
            </AppText>
          </View>
          <Button
            label="−"
            accessibilityLabel="Earlier reset day"
            variant="secondary"
            onPress={() => setStartDay(s.periodStartDay - 1)}
            disabled={s.periodStartDay <= 1}
            accessibilityHint="Move the reset day one day earlier"
          />
          <Button
            label="+"
            accessibilityLabel="Later reset day"
            variant="secondary"
            onPress={() => setStartDay(s.periodStartDay + 1)}
            disabled={s.periodStartDay >= MAX_PERIOD_START_DAY}
            accessibilityHint="Move the reset day one day later"
          />
        </View>
      </Section>

      <Section title="Security">
        <ToggleRow
          label="App lock"
          hint="Ask for Face ID, fingerprint or passcode when opening Nickel"
          value={s.appLock}
          onChange={toggleLock}
        />
      </Section>

      {crashReportingAvailable && (
        <Section title="Privacy">
          <ToggleRow
            label="Send crash reports"
            hint="Error and stack trace only; never amounts, notes or merchants"
            value={s.crashReports}
            onChange={(v) => {
              setCrashReportingConsent(v);
              update.mutate({ crashReports: v });
            }}
          />
        </Section>
      )}

      <Section title="Notifications">
        <ToggleRow
          label="Bill reminders"
          hint="The day before each bill is due"
          value={s.notifyBills}
          onChange={toggle('notifyBills')}
        />
        <Rule />
        <ToggleRow
          label="Budget warnings"
          hint="At 80% and 100% of a limit, once a month each"
          value={s.notifyBudget}
          onChange={toggle('notifyBudget')}
        />
        <Rule />
        <ToggleRow
          label="Weekly summary"
          hint="Sunday evening"
          value={s.notifyWeekly}
          onChange={toggle('notifyWeekly')}
        />
      </Section>

      <Section title="Data">
        <Row
          title="Categories"
          subtitle="Add, edit and archive"
          onPress={() => router.push('/categories')}
        />
        <Rule />
        <Row
          title="Category rules"
          subtitle="File merchants automatically"
          onPress={() => router.push('/rules')}
        />
        <Rule />
        <Row title="Goals" subtitle="Savings targets" onPress={() => router.push('/goals')} />
        <Rule />
        <Row
          title="Import CSV"
          subtitle="From a bank export"
          onPress={() => router.push('/import')}
        />
        <Rule />
        <Row title="Export CSV" subtitle="All transactions" onPress={exportCsv} />
        <Rule />
        <Row
          title="Back up data"
          subtitle="Everything except receipt photos, as one file"
          onPress={backUp}
        />
        <Rule />
        <Row title="Restore from backup" subtitle="Replaces all data" onPress={restore} />
      </Section>

      {message && (
        <AppText tone="textMuted" style={{ padding: space.lg }} accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}

      <Pressable
        onLongPress={() => router.push('/debug')}
        delayLongPress={800}
        accessibilityRole="text"
        accessibilityHint="Long press to open the debug screen"
        style={{ padding: space.lg, marginTop: space.xl }}
      >
        <AppText variant="small" tone="textMuted">
          Nickel {Constants.expoConfig?.version ?? ''}
          {Updates.channel
            ? ` (${Updates.channel}${Updates.updateId ? `, update ${Updates.updateId.slice(0, 8)}` : ''})`
            : ''}
          . All data stays on this device.
        </AppText>
      </Pressable>
    </Screen>
  );
}
