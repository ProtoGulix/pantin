// Limits how often a value is sent while keeping the last one: dragging a
// slider produces many values, the core needs at most ~30 per second, and the
// final position must always arrive. Time and timers are injected so tests
// need neither.

export interface Scheduler {
  now(): number;
  after(delayMs: number, callback: () => void): void;
}

export interface Throttle<Value> {
  push(value: Value): void;
  // Drops the waiting value: a timer already armed then sends nothing. For a
  // slider that goes away, whose last value must not reach another target.
  cancel(): void;
}

export function createThrottle<Value>(
  send: (value: Value) => void,
  intervalMs: number,
  scheduler: Scheduler,
): Throttle<Value> {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let waiting: { value: Value } | null = null;
  let timerArmed = false;
  let cancelled = false;

  const sendNow = (value: Value): void => {
    lastSentAt = scheduler.now();
    send(value);
  };

  const flush = (): void => {
    timerArmed = false;
    if (waiting !== null && !cancelled) {
      const { value } = waiting;
      waiting = null;
      sendNow(value);
    }
  };

  return {
    cancel() {
      cancelled = true;
      waiting = null;
    },
    push(value) {
      if (cancelled) {
        return;
      }
      const elapsed = scheduler.now() - lastSentAt;
      if (!timerArmed && elapsed >= intervalMs) {
        sendNow(value);
        return;
      }
      waiting = { value };
      if (!timerArmed) {
        timerArmed = true;
        scheduler.after(intervalMs - elapsed, flush);
      }
    },
  };
}
