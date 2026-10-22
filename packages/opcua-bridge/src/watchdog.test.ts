import { describe, expect, it } from "vitest";
import { startWatchdog, type Timers } from "./watchdog.ts";

// Timers the test advances by hand.
function manualTimers() {
  let now = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  let nextHandle = 1;
  const timers: Timers = {
    set: (callback, milliseconds) => {
      pending.set(nextHandle, { at: now + milliseconds, callback });
      return nextHandle++;
    },
    clear: (handle) => {
      pending.delete(handle as number); // the handle is the number `set` returned
    },
  };
  const advance = (milliseconds: number): void => {
    now += milliseconds;
    for (const [handle, timer] of [...pending]) {
      if (timer.at <= now) {
        pending.delete(handle);
        timer.callback();
      }
    }
  };
  return { timers, advance };
}

describe("startWatchdog", () => {
  it("expires after the silence", () => {
    const { timers, advance } = manualTimers();
    let expired = 0;
    startWatchdog(300, () => expired++, timers);

    advance(299);
    expect(expired).toBe(0);
    advance(1);
    expect(expired).toBe(1);
  });

  it("starts the silence again at every feed", () => {
    const { timers, advance } = manualTimers();
    let expired = 0;
    const watchdog = startWatchdog(300, () => expired++, timers);

    for (let beat = 0; beat < 5; beat++) {
      advance(200);
      watchdog.feed();
    }
    expect(expired).toBe(0);
    advance(300);
    expect(expired).toBe(1);
  });

  it("expires once, and not at all after stop", () => {
    const { timers, advance } = manualTimers();
    let expired = 0;
    const first = startWatchdog(100, () => expired++, timers);
    advance(500);
    first.feed();
    advance(500);
    expect(expired).toBe(1);

    const second = startWatchdog(100, () => expired++, timers);
    second.stop();
    advance(500);
    expect(expired).toBe(1);
  });
});
