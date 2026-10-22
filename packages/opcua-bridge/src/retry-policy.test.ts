import { describe, expect, it } from "vitest";
import { createRetryPolicy } from "./retry-policy.ts";

describe("retry policy", () => {
  it("backs off from 1 s, doubling up to 10 s, for a closed or silent connection", () => {
    const policy = createRetryPolicy();

    const delays = ["closed", "timeout", "closed", "closed", "closed", "closed"].map((reason) =>
      policy.delayAfter(reason as "closed" | "timeout"),
    );

    expect(delays).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
  });

  it("starts the backoff over after a healthy session", () => {
    const policy = createRetryPolicy();
    policy.delayAfter("closed");
    policy.delayAfter("closed");

    policy.sessionWasHealthy();

    expect(policy.delayAfter("closed")).toBe(1000);
  });

  it("retries node_mismatch and certificate_rejected every 10 s, without growing the backoff", () => {
    const policy = createRetryPolicy();

    expect(policy.delayAfter("node_mismatch")).toBe(10_000);
    expect(policy.delayAfter("certificate_rejected")).toBe(10_000);
    expect(policy.delayAfter("closed")).toBe(1000);
  });
});
