import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button, Loading, Rule, Screen, Section, Segmented } from '@/components/ui';
import { useDb } from '@/db/DbProvider';
import { listCategories } from '@/db/repositories/categories';
import { allEvents, eventsNamed } from '@/db/repositories/events';
import { importBatch } from '@/db/repositories/imports';
import { countTransactions } from '@/db/repositories/transactions';
import { timed } from '@/events/track';
import { listFlagStates, overrideVariant, resetInstallId } from '@/flags/store';
import { useAppContext } from '@/hooks/AppContext';
import { keys, useFlagStates, useRecentEvents } from '@/hooks/queries';
import { shareTextFile } from '@/hooks/shareFile';
import { toIsoDate } from '@/services/dates';
import { generateDemoTransactions } from '@/services/demoData';
import { summarizeTimings } from '@/services/stats';
import { space, useTheme } from '@/theme/tokens';

export default function DebugScreen() {
  const db = useDb();
  const theme = useTheme();
  const qc = useQueryClient();
  const { installId, encrypted } = useAppContext();
  const events = useRecentEvents();
  const flags = useFlagStates();
  const timings = useQuery({
    queryKey: [...keys.events, 'timings'],
    queryFn: async () =>
      summarizeTimings(
        (await eventsNamed(db, 'timing', 5000)).map((e) => ({
          name: String(e.props.name),
          ms: Number(e.props.ms),
        })),
      ),
  });
  const counts = useQuery({
    queryKey: [...keys.events, 'count'],
    queryFn: () => countTransactions(db),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.all });

  const exportEvents = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      installId,
      flags: await listFlagStates(db),
      events: await allEvents(db),
    };
    await shareTextFile(
      `nickel-events-${toIsoDate(new Date())}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
  };

  const seed = async (count: number) => {
    setBusy(true);
    try {
      const rows = generateDemoTransactions({
        categories: await listCategories(db),
        today: toIsoDate(new Date()),
        count,
        subscriptions: true,
      });
      await timed(
        'seed_import',
        () => importBatch(db, { filename: `demo-${count}.csv`, rows, errorCount: 0 }),
        { rows: rows.length },
      );
      setMessage(
        `Added ${rows.length} demo transactions as one import batch (undo it from Import).`,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!events.data || !flags.data) return <Loading />;

  return (
    <Screen testID="debug-screen">
      <View style={{ padding: space.lg, gap: space.xs }}>
        <AppText variant="small" tone="textMuted">
          Install id: {installId}
        </AppText>
        <AppText variant="small" tone="textMuted">
          Database: {encrypted ? 'encrypted (SQLCipher)' : 'not encrypted (Expo Go)'}
        </AppText>
        <AppText variant="small" tone="textMuted">
          Transactions: {counts.data ?? '…'}
        </AppText>
      </View>

      <Section title="Flags">
        {flags.data.map((f) => (
          <View key={f.key} style={{ paddingBottom: space.md }}>
            <AppText style={{ paddingHorizontal: space.lg }} weight="medium">
              {f.key} {f.overridden ? '(overridden)' : ''}
            </AppText>
            <AppText
              variant="small"
              tone="textMuted"
              style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}
            >
              {f.description}
            </AppText>
            <Segmented
              accessibilityLabel={`Variant for ${f.key}`}
              value={f.variant ?? ''}
              options={f.variants.map((v) => ({ value: v, label: v }))}
              onChange={async (v) => {
                await overrideVariant(db, f.key, v);
                setMessage('Override saved. Restart the app to apply it everywhere.');
                await refresh();
              }}
            />
          </View>
        ))}
      </Section>

      <Section title="Timings">
        {(timings.data ?? []).length === 0 ? (
          <AppText tone="textMuted" style={{ paddingHorizontal: space.lg }}>
            No timings yet.
          </AppText>
        ) : (
          <View style={{ paddingHorizontal: space.lg }}>
            <View style={{ flexDirection: 'row', paddingVertical: space.xs }}>
              <AppText variant="small" tone="textMuted" style={{ flex: 2 }}>
                Name
              </AppText>
              <AppText variant="small" tone="textMuted" style={{ flex: 1, textAlign: 'right' }}>
                n
              </AppText>
              <AppText variant="small" tone="textMuted" style={{ flex: 1, textAlign: 'right' }}>
                median
              </AppText>
              <AppText variant="small" tone="textMuted" style={{ flex: 1, textAlign: 'right' }}>
                p95
              </AppText>
            </View>
            {timings.data!.map((t) => (
              <View
                key={t.name}
                style={{
                  flexDirection: 'row',
                  paddingVertical: space.xs,
                  borderTopWidth: 1,
                  borderTopColor: theme.rule,
                }}
              >
                <AppText variant="small" style={{ flex: 2 }}>
                  {t.name}
                </AppText>
                <AppText variant="small" style={{ flex: 1, textAlign: 'right' }}>
                  {t.count}
                </AppText>
                <AppText variant="small" style={{ flex: 1, textAlign: 'right' }}>
                  {Math.round(t.medianMs)} ms
                </AppText>
                <AppText variant="small" style={{ flex: 1, textAlign: 'right' }}>
                  {Math.round(t.p95Ms)} ms
                </AppText>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section title="Tools">
        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <Button
            label="Export events as JSON"
            variant="secondary"
            onPress={() => void exportEvents()}
          />
          <Button
            label="Add 1,000 demo transactions"
            variant="secondary"
            busy={busy}
            onPress={() => void seed(1000)}
          />
          <Button
            label="Add 10,000 demo transactions"
            variant="secondary"
            busy={busy}
            onPress={() => void seed(10000)}
          />
          <Button
            label="Reset install id"
            variant="danger"
            onPress={() =>
              Alert.alert(
                'Reset install id?',
                'Flags are reassigned on next start, as if this were a new install.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      await resetInstallId(db, () => Crypto.randomUUID());
                      setMessage('Install id reset. Restart the app.');
                      await refresh();
                    },
                  },
                ],
              )
            }
          />
          {message && <AppText tone="textMuted">{message}</AppText>}
        </View>
      </Section>

      <Section title={`Last ${events.data.length} events`}>
        {events.data.map((e, i) => (
          <View key={e.id}>
            {i > 0 && <Rule />}
            <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <AppText variant="small" weight="medium">
                {e.name}
              </AppText>
              <AppText variant="small" tone="textMuted" numberOfLines={2}>
                {e.ts.slice(0, 19).replace('T', ' ')} · {JSON.stringify(e.props)}
              </AppText>
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}
