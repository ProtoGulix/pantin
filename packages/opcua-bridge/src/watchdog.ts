// The publish watchdog of a module (ADR 0065 point 6): it expires when nothing was fed for
// `milliseconds`. The timers are injected so that the logic is tested without waiting.

export type Timers = {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
};

export const REAL_TIMERS: Timers = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout), // handle comes from `set` above
};

export type Watchdog = {
  /** A publish response arrived: the silence starts again. */
  feed(): void;
  /** Stops it for good: `onExpire` is not called after this. */
  stop(): void;
};

/** Starts counting at once, as if fed. */
export function startWatchdog(
  milliseconds: number,
  onExpire: () => void,
  timers: Timers = REAL_TIMERS,
): Watchdog {
  let handle: unknown;
  let stopped = false;
  const arm = (): void => {
    handle = timers.set(() => {
      if (!stopped) {
        stopped = true;
        onExpire();
      }
    }, milliseconds);
  };
  arm();
  return {
    feed: () => {
      if (!stopped) {
        timers.clear(handle);
        arm();
      }
    },
    stop: () => {
      stopped = true;
      timers.clear(handle);
    },
  };
}
