/**
 * The one entry point for instrumentation. Every event goes through track(),
 * so the list of names below is the complete analytics vocabulary.
 */
export const EVENT_NAMES = [
  'app_open',
  'onboarding_step',
  'experiment_exposure',
  'transaction_added',
  'budget_set',
  'import_completed',
  'import_failed',
  'notification_opened',
  'error',
  'timing',
  /** A feature without its own event: props.feature names it (quick_add, rule_created, ...). */
  'feature_used',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, string | number | boolean | null>;

export interface TrackedEvent {
  name: EventName;
  props: EventProps;
  ts: string;
  sessionId: string;
}

type Sink = (event: TrackedEvent) => Promise<void>;

const MAX_BUFFER = 500;

let sink: Sink | null = null;
let sessionId = 'pending';
let buffer: TrackedEvent[] = [];
let clock: () => Date = () => new Date();

/**
 * Connects the tracker to storage once the database is open. Events tracked
 * before that are held in memory and written now, in order.
 */
export async function attachEventSink(next: Sink, session: string): Promise<void> {
  sink = next;
  sessionId = session;
  const pending = buffer;
  buffer = [];
  for (const e of pending) {
    await next({ ...e, sessionId: session }).catch(() => undefined);
  }
}

/** True once the database sink is connected for this process. */
export function isEventSinkAttached(): boolean {
  return sink !== null;
}

export function track(name: EventName, props: EventProps = {}): void {
  const event: TrackedEvent = { name, props, ts: clock().toISOString(), sessionId };
  if (sink) {
    // Instrumentation must never break the feature it measures.
    sink(event).catch(() => undefined);
  } else if (buffer.length < MAX_BUFFER) {
    buffer.push(event);
  }
}

/** Records a duration as a `timing` event. */
export function trackTiming(name: string, ms: number, props: EventProps = {}): void {
  track('timing', { ...props, name, ms: Math.round(ms) });
}

/** Wraps an async task and records how long it took, success or failure. */
export async function timed<T>(
  name: string,
  task: () => Promise<T>,
  props: EventProps = {},
): Promise<T> {
  const start = now();
  try {
    return await task();
  } finally {
    trackTiming(name, now() - start, props);
  }
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Test hooks. */
export const __testing = {
  reset() {
    sink = null;
    sessionId = 'pending';
    buffer = [];
    clock = () => new Date();
  },
  setClock(fn: () => Date) {
    clock = fn;
  },
  buffered: () => buffer.length,
};
