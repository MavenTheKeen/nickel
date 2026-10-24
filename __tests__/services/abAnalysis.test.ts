import {
  outcomeFor,
  report,
  summarize,
  wilsonInterval,
  type DeviceExport,
} from '@/services/abAnalysis';

const device = (
  installId: string,
  variant: string,
  txnAfterHours: number | null,
  overridden = false,
): DeviceExport => ({
  installId,
  flags: [{ key: 'onboarding_v1', variant, overridden }],
  events: [
    { name: 'app_open', props: {}, ts: '2025-06-01T10:00:00.000Z' },
    ...(txnAfterHours === null
      ? []
      : [
          {
            name: 'transaction_added',
            props: {},
            ts: new Date(
              Date.parse('2025-06-01T10:00:00.000Z') + txnAfterHours * 3_600_000,
            ).toISOString(),
          },
        ]),
  ],
});

describe('A/B analysis', () => {
  it('counts a first transaction within 24 hours as converted', () => {
    expect(outcomeFor(device('a', 'A', 2), 'onboarding_v1')).toMatchObject({
      converted: true,
      hoursToFirstTransaction: 2,
    });
    expect(outcomeFor(device('b', 'A', 30), 'onboarding_v1')).toMatchObject({ converted: false });
    expect(outcomeFor(device('c', 'B', null), 'onboarding_v1')).toMatchObject({
      converted: false,
      hoursToFirstTransaction: null,
    });
  });

  it('excludes overridden and unassigned installs', () => {
    expect(outcomeFor(device('a', 'A', 1, true), 'onboarding_v1')).toBeNull();
    expect(outcomeFor({ installId: 'x', flags: [], events: [] }, 'onboarding_v1')).toBeNull();
  });

  it('summarises per variant and de-duplicates repeated exports', () => {
    const outcomes = [
      device('1', 'A', 1),
      device('1', 'A', 1),
      device('2', 'A', null),
      device('3', 'B', 1),
    ].map((d) => outcomeFor(d, 'onboarding_v1')!);
    const s = summarize(outcomes);
    expect(s.map((x) => [x.variant, x.installs, x.converted])).toEqual([
      ['A', 2, 1],
      ['B', 1, 1],
    ]);
  });

  it('computes a Wilson interval', () => {
    const { low, high } = wilsonInterval(5, 10);
    expect(low).toBeCloseTo(0.237, 2);
    expect(high).toBeCloseTo(0.763, 2);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it('states the sample size and its limits', () => {
    const text = report(
      summarize(
        [device('1', 'A', 1), device('2', 'B', null)].map((d) => outcomeFor(d, 'onboarding_v1')!),
      ),
    );
    expect(text).toContain('Sample size: 2 installs.');
    expect(text).toContain('cannot tell the variants apart');
  });
});
