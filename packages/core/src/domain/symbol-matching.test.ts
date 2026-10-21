import type { PlcSymbol } from "@pantin/plc-symbol-formats/model";
import type { IoChannel, IoModule } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  type MappedSignal,
  matchSignals,
  type ReferencedSymbol,
  referencedSymbol,
} from "./symbol-matching.ts";

// The three matching rules and their ambiguities (ADR 0064 point 12).

const MODULE: IoModule = {
  key: "m1",
  transport: {
    kind: "modbus_tcp_slave",
    port: 1502,
    unitId: 1,
    wordOrder: "low_word_first",
    watchdogMilliseconds: 1000,
  },
  channels: [],
};

function signal(tag: string, variable: string): MappedSignal {
  const channel: IoChannel = {
    tag,
    variable,
    comment: "",
    modbus: { zone: "coil", address: 0, ioType: "BOOL" },
  };
  return { tag, type: "bit", direction: "command", channels: [{ module: MODULE, channel }] };
}

function symbol(...path: string[]): ReferencedSymbol {
  const plcSymbol: PlcSymbol = {
    path: ["Application", ...path],
    iecType: "BOOL",
    access: "read_write",
    comment: null,
  };
  return referencedSymbol(plcSymbol);
}

const referencesOf = (matches: ReturnType<typeof matchSignals>["matches"]) =>
  matches.map((match) => `${match.signal.tag} -> ${match.symbol.reference} (${match.rule})`);

describe("rule 1, exact", () => {
  it("matches the last segment against the current variable, ignoring case", () => {
    const { matches } = matchSignals(
      [signal("a.valve.coil_14", "Extend")],
      [symbol("GVL", "EXTEND"), symbol("GVL", "other")],
    );
    expect(referencesOf(matches)).toEqual(["a.valve.coil_14 -> GVL.EXTEND (exact)"]);
  });

  it("matches a dotted variable against the end of the reference", () => {
    const { matches } = matchSignals(
      [signal("a.valve.coil_14", "GVL_IO.Verin1.Extend")],
      [symbol("GVL_IO", "Verin1", "Extend"), symbol("Other", "Verin1", "Extend")],
    );
    expect(referencesOf(matches)).toEqual(["a.valve.coil_14 -> GVL_IO.Verin1.Extend (exact)"]);
  });

  it("does not match a longer dotted variable against a shorter reference", () => {
    const { matches } = matchSignals([signal("a.v.x", "GVL.speed")], [symbol("speed")]);
    expect(matches).toEqual([]);
  });
});

describe("rule 2, normalised against the variable derived from the tag", () => {
  it("ignores case and underscores on both sides", () => {
    const { matches } = matchSignals(
      [signal("axis.valve.coil_14", "old_name")],
      [symbol("GVL", "AxisValveCoil14")],
    );
    expect(referencesOf(matches)).toEqual([
      "axis.valve.coil_14 -> GVL.AxisValveCoil14 (normalised)",
    ]);
  });

  it("runs after rule 1: an exact match takes its symbol first", () => {
    const { matches } = matchSignals(
      [signal("axis.valve.coil_14", "axis_valve_coil_14"), signal("axis.valve.coil_12", "x")],
      [symbol("GVL", "axis_valve_coil_14"), symbol("GVL", "axisvalvecoil12")],
    );
    expect(referencesOf(matches)).toEqual([
      "axis.valve.coil_14 -> GVL.axis_valve_coil_14 (exact)",
      "axis.valve.coil_12 -> GVL.axisvalvecoil12 (normalised)",
    ]);
  });
});

describe("rule 3, suffix: the tag key and the member", () => {
  it("matches a name made of the tag key and the member, without the assembly", () => {
    const { matches } = matchSignals(
      [signal("axis.valve.coil_14", "old")],
      [symbol("PLC_PRG", "fbCylinder", "ValveCoil14")],
    );
    expect(referencesOf(matches)).toEqual([
      "axis.valve.coil_14 -> PLC_PRG.fbCylinder.ValveCoil14 (suffix)",
    ]);
  });

  it("turns a dash of the tag key into an underscore before normalising", () => {
    const { matches } = matchSignals(
      [signal("axis.valve-max.state", "old")],
      [symbol("GVL", "valve_max_state")],
    );
    expect(referencesOf(matches)).toEqual(["axis.valve-max.state -> GVL.valve_max_state (suffix)"]);
  });
});

describe("rule 3 at boundaries", () => {
  it("matches a trailing run of the underscore-separated parts, as in the real GVL", () => {
    const { matches } = matchSignals(
      [signal("tige.verin-min.state", "tige_verin_min_state")],
      [symbol("GVL", "verin1_verin_min_state")],
    );
    expect(referencesOf(matches)).toEqual([
      "tige.verin-min.state -> GVL.verin1_verin_min_state (suffix)",
    ]);
  });

  it("does not match in the middle of a part, nor a run that does not end the name", () => {
    expect(
      matchSignals([signal("a.min.state", "x")], [symbol("GVL", "verin_minstate_extra")]).matches,
    ).toEqual([]);
    expect(
      matchSignals([signal("a.min.state", "x")], [symbol("GVL", "xmin_state")]).matches,
    ).toEqual([]);
  });

  it("finds no boundary in a CamelCase name: only the whole name can match", () => {
    expect(
      matchSignals([signal("a.min.state", "x")], [symbol("GVL", "Verin1MinState")]).matches,
    ).toEqual([]);
    expect(
      matchSignals([signal("a.min.state", "x")], [symbol("GVL", "MinState")]).matches,
    ).toHaveLength(1);
  });

  it("stays unique on both sides when two names end the same way", () => {
    const { matches, ambiguous } = matchSignals(
      [signal("a.min.state", "x")],
      [symbol("GVL", "one_min_state"), symbol("GVL", "two_min_state")],
    );
    expect(matches).toEqual([]);
    expect(ambiguous.get("a.min.state")).toHaveLength(2);
  });
});

describe("uniqueness on both sides", () => {
  it("does not match when two symbols fit one signal, and lists them", () => {
    const { matches, ambiguous } = matchSignals(
      [signal("a.v.x", "speed")],
      [symbol("GVL", "speed"), symbol("PLC_PRG", "speed")],
    );
    expect(matches).toEqual([]);
    expect(ambiguous.get("a.v.x")?.map((candidate) => candidate.reference)).toEqual([
      "GVL.speed",
      "PLC_PRG.speed",
    ]);
  });

  it("does not match when two signals fit one symbol", () => {
    const { matches, ambiguous } = matchSignals(
      [signal("a.v.x", "speed"), signal("b.w.y", "SPEED")],
      [symbol("GVL", "speed")],
    );
    expect(matches).toEqual([]);
    expect([...ambiguous.keys()].sort()).toEqual(["a.v.x", "b.w.y"]);
  });

  it("lets a later rule settle what an earlier one found ambiguous", () => {
    const { matches, ambiguous } = matchSignals(
      [signal("axis.valve.coil_14", "speed")],
      [symbol("GVL", "speed"), symbol("PLC_PRG", "speed"), symbol("GVL", "AxisValveCoil14")],
    );
    expect(referencesOf(matches)).toEqual([
      "axis.valve.coil_14 -> GVL.AxisValveCoil14 (normalised)",
    ]);
    expect(ambiguous.size).toBe(0);
  });

  it("keeps at most ten candidates", () => {
    const symbols = Array.from({ length: 12 }, (_, index) => symbol(`P${index}`, "speed"));
    const { ambiguous } = matchSignals([signal("a.v.x", "speed")], symbols);
    expect(ambiguous.get("a.v.x")).toHaveLength(10);
  });

  it("handles 50 000 symbols sharing one last segment without copying arrays", () => {
    const symbols = Array.from({ length: 50_000 }, (_, index) => symbol(`P${index}`, "speed"));
    const started = performance.now();
    const { matches, ambiguous } = matchSignals([signal("a.v.x", "speed")], symbols);
    expect(matches).toEqual([]);
    expect(ambiguous.get("a.v.x")).toHaveLength(10);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("leaves a signal with no candidate out of the ambiguous ones", () => {
    const { matches, ambiguous } = matchSignals(
      [signal("a.v.x", "speed")],
      [symbol("GVL", "other")],
    );
    expect(matches).toEqual([]);
    expect(ambiguous.size).toBe(0);
  });
});
