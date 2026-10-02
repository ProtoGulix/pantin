// A dragged value goes to the core as ADR 0016 point 5 says: one request in
// flight, and while it is, the latest value replaces any value still waiting.
// The core therefore never sees a queue of stale positions, and the final
// value always arrives. The request and the error report are injected.

export interface LatestWinsSender<Value> {
  push(value: Value): void;
  /** Resolves once nothing is in flight and nothing waits. */
  settled(): Promise<void>;
}

export function createLatestWinsSender<Value>(
  send: (value: Value) => Promise<void>,
  onError: (error: unknown) => void,
): LatestWinsSender<Value> {
  let inFlight = false;
  let waiting: { value: Value } | null = null;
  let waitingForIdle: (() => void)[] = [];

  const becomeIdle = (): void => {
    const callbacks = waitingForIdle;
    waitingForIdle = [];
    for (const resolve of callbacks) {
      resolve();
    }
  };

  const start = (value: Value): void => {
    inFlight = true;
    send(value)
      .catch(onError)
      .finally(() => {
        inFlight = false;
        if (waiting === null) {
          becomeIdle();
          return;
        }
        const { value: next } = waiting;
        waiting = null;
        start(next);
      });
  };

  return {
    push(value) {
      if (inFlight) {
        waiting = { value };
      } else {
        start(value);
      }
    },
    settled() {
      return inFlight ? new Promise((resolve) => waitingForIdle.push(resolve)) : Promise.resolve();
    },
  };
}
