import { describe, expect, it, vi } from "vitest";
import { runForcing, submitForcedValue } from "./diagram-forcing.ts";

// Carrying out a decision of socketAction: the same intents as the inspector.

function intents() {
  return { toggleBitTag: vi.fn(), writeFloatTag: vi.fn(), selectDiagramNode: vi.fn() };
}
const opener = {} as Element; // only passed through to openValueInput

describe("runForcing", () => {
  it("toggles a bit through the tag write, and selects nothing", () => {
    const calls = intents();
    const openValueInput = vi.fn();
    expect(
      runForcing({ kind: "toggle", tag: "a.v1.coil_14" }, opener, {
        intents: calls,
        openValueInput,
      }),
    ).toBe(true);
    expect(calls.toggleBitTag).toHaveBeenCalledWith("a.v1.coil_14");
    expect(calls.selectDiagramNode).not.toHaveBeenCalled();
    expect(openValueInput).not.toHaveBeenCalled();
  });

  it("opens the input of a numeric command beside its socket, writing nothing", () => {
    const calls = intents();
    const openValueInput = vi.fn();
    runForcing({ kind: "openInput", tag: "a.sv.setpoint" }, opener, {
      intents: calls,
      openValueInput,
    });
    expect(openValueInput).toHaveBeenCalledWith(opener, "a.sv.setpoint");
    expect(calls.toggleBitTag).not.toHaveBeenCalled();
    expect(calls.writeFloatTag).not.toHaveBeenCalled();
  });

  it("leaves the link menu and doing nothing to the caller", () => {
    const calls = intents();
    const openValueInput = vi.fn();
    for (const action of [{ kind: "openLinkMenu" }, { kind: "none" }] as const) {
      expect(runForcing(action, opener, { intents: calls, openValueInput })).toBe(false);
    }
    expect(calls.toggleBitTag).not.toHaveBeenCalled();
  });
});

describe("submitForcedValue", () => {
  it("sends the typed text to the tag write, which converts it to SI", () => {
    const calls = intents();
    expect(submitForcedValue("a.sv.setpoint", "40", calls)).toBe(true);
    expect(calls.writeFloatTag).toHaveBeenCalledWith("a.sv.setpoint", "40");
  });

  it("refuses what is not a number and writes nothing", () => {
    const calls = intents();
    expect(submitForcedValue("a.sv.setpoint", "abc", calls)).toBe(false);
    expect(submitForcedValue("a.sv.setpoint", "", calls)).toBe(false);
    expect(calls.writeFloatTag).not.toHaveBeenCalled();
  });
});
