import { describe, expect, it } from "vitest";
import { keepAliveCountFor, lifetimeCountFor } from "./subscription-timing.ts";

describe("keepAliveCountFor", () => {
  it("answers at least 3 times per watchdog window", () => {
    expect(keepAliveCountFor(1000, 20)).toBe(16);
    expect(keepAliveCountFor(300, 20)).toBe(5);
  });

  it("uses the revised interval, which may be longer than the requested one", () => {
    expect(keepAliveCountFor(1000, 100)).toBe(3);
  });

  it("never goes below 1, even when one interval is longer than the window", () => {
    expect(keepAliveCountFor(100, 500)).toBe(1);
  });

  it("gives the lifetime 3 times the keep-alive count", () => {
    expect(lifetimeCountFor(5)).toBe(15);
  });
});
