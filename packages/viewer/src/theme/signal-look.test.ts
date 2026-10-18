import { describe, expect, it } from "vitest";
import { signalColourFor, signalLookFor } from "./signal-look.ts";

describe("signalLookFor", () => {
  it("draws an on signal thicker and more opaque than an off one", () => {
    const on = signalLookFor(true);
    const off = signalLookFor(false);
    expect(on.alpha).toBe(1);
    expect(off.alpha).toBeLessThan(1);
    expect(on.thicknessScale / off.thicknessScale).toBeGreaterThanOrEqual(2);
  });
});

describe("signalColourFor", () => {
  it("takes the on colour for an on signal and the neutral otherwise", () => {
    const colours = { on: "#2a6e3f", off: "#0d1117" };
    expect(signalColourFor(true, colours)).toBe("#2a6e3f");
    expect(signalColourFor(false, colours)).toBe("#0d1117");
  });
});
