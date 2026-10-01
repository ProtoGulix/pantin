import { describe, expect, it } from "vitest";
import { createThrottle, type Scheduler } from "./throttle.ts";

// A clock the test moves by hand; timers fire when the clock reaches them.
function fakeScheduler() {
  let time = 0;
  const timers: { at: number; callback: () => void }[] = [];
  const scheduler: Scheduler = {
    now: () => time,
    after: (delayMs, callback) => timers.push({ at: time + delayMs, callback }),
  };
  const advance = (ms: number): void => {
    time += ms;
    for (const timer of timers.splice(0)) {
      if (timer.at <= time) {
        timer.callback();
      } else {
        timers.push(timer);
      }
    }
  };
  return { scheduler, advance };
}

describe("createThrottle", () => {
  it("sends the first value at once", () => {
    const { scheduler } = fakeScheduler();
    const sent: number[] = [];
    createThrottle((value: number) => sent.push(value), 33, scheduler).push(1);
    expect(sent).toEqual([1]);
  });

  it("keeps only the latest value inside an interval and sends it when it ends", () => {
    const { scheduler, advance } = fakeScheduler();
    const sent: number[] = [];
    const throttle = createThrottle((value: number) => sent.push(value), 33, scheduler);
    throttle.push(1);
    advance(10);
    throttle.push(2);
    throttle.push(3);
    expect(sent).toEqual([1]);
    advance(22);
    expect(sent).toEqual([1]);
    advance(1);
    expect(sent).toEqual([1, 3]);
  });

  it("sends at most one value per interval during a long drag", () => {
    const { scheduler, advance } = fakeScheduler();
    const sent: number[] = [];
    const throttle = createThrottle((value: number) => sent.push(value), 33, scheduler);
    for (let step = 0; step < 100; step += 1) {
      throttle.push(step);
      advance(5);
    }
    advance(40);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(540 / 33) + 1);
    expect(sent.at(-1)).toBe(99);
  });
});

describe("createThrottle after a burst", () => {
  it("sends immediately again after a quiet period", () => {
    const { scheduler, advance } = fakeScheduler();
    const sent: number[] = [];
    const throttle = createThrottle((value: number) => sent.push(value), 33, scheduler);
    throttle.push(1);
    advance(100);
    throttle.push(2);
    expect(sent).toEqual([1, 2]);
  });

  it("sends nothing more once cancelled, not even the value waiting for its timer", () => {
    const { scheduler, advance } = fakeScheduler();
    const sent: number[] = [];
    const throttle = createThrottle((value: number) => sent.push(value), 33, scheduler);
    throttle.push(1);
    throttle.push(2);
    throttle.cancel();
    advance(40);
    throttle.push(3);
    expect(sent).toEqual([1]);
  });
});
