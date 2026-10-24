import {
  __testing,
  attachEventSink,
  timed,
  track,
  trackTiming,
  type TrackedEvent,
} from '@/events/track';

beforeEach(() => {
  __testing.reset();
  __testing.setClock(() => new Date('2025-06-15T12:00:00.000Z'));
});

describe('track', () => {
  it('buffers events until a sink is attached, then writes them in order', async () => {
    track('app_open');
    track('transaction_added', { kind: 'expense' });
    expect(__testing.buffered()).toBe(2);
    const written: TrackedEvent[] = [];
    await attachEventSink(async (e) => {
      written.push(e);
    }, 'session-1');
    expect(written.map((e) => e.name)).toEqual(['app_open', 'transaction_added']);
    expect(written.every((e) => e.sessionId === 'session-1')).toBe(true);
    expect(__testing.buffered()).toBe(0);
  });

  it('writes directly once attached, with timestamp and session', async () => {
    const written: TrackedEvent[] = [];
    await attachEventSink(async (e) => {
      written.push(e);
    }, 's');
    track('budget_set', { month: '2025-06' });
    await Promise.resolve();
    expect(written).toEqual([
      {
        name: 'budget_set',
        props: { month: '2025-06' },
        ts: '2025-06-15T12:00:00.000Z',
        sessionId: 's',
      },
    ]);
  });

  it('never throws when the sink fails', async () => {
    await attachEventSink(async () => {
      throw new Error('disk full');
    }, 's');
    expect(() => track('error', { message: 'x' })).not.toThrow();
  });

  it('caps the pre-attach buffer', () => {
    for (let i = 0; i < 600; i++) track('app_open');
    expect(__testing.buffered()).toBe(500);
  });

  it('records rounded timings', async () => {
    const written: TrackedEvent[] = [];
    await attachEventSink(async (e) => {
      written.push(e);
    }, 's');
    trackTiming('insights_load', 12.6, { rows: 3 });
    expect(written[0]).toMatchObject({
      name: 'timing',
      props: { name: 'insights_load', ms: 13, rows: 3 },
    });
  });

  it('times async work even when it fails', async () => {
    const written: TrackedEvent[] = [];
    await attachEventSink(async (e) => {
      written.push(e);
    }, 's');
    await expect(
      timed('import_duration', async () => Promise.reject(new Error('bad'))),
    ).rejects.toThrow('bad');
    expect(await timed('ok', async () => 42)).toBe(42);
    expect(written.map((e) => e.props.name)).toEqual(['import_duration', 'ok']);
  });
});
