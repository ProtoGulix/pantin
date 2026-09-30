import { describe, expect, it } from "vitest";
import { stepDrive } from "./behaviours.ts";
import type { DriveFields } from "./schemas.ts";

// Valves as tables (ADR 0028 point 4): commands and previous spool to ports
// and diagnostics. Spool: 1 is pilot 14, -1 pilot 12, 0 the centre.

type Ports = Record<string, string>;
type ValveType = Extract<DriveFields["type"], `valve_${string}`>;
interface Row {
  coils: [coil14: number, coil12: number];
  // Undefined: a never-stepped valve.
  spool: number | undefined;
  ports: Ports;
  spoolAfter?: number;
  diagnostics?: string[];
}

const P14: Ports = { port_2: "exhaust", port_4: "pressure" };
const P12: Ports = { port_2: "pressure", port_4: "exhaust" };
const both = (state: string): Ports => ({ port_2: state, port_4: state });
const CONFLICT = ["conflicting_commands"];

function run(type: ValveType, [coil14, coil12]: Row["coils"], spool?: number) {
  return stepDrive({
    fields: { type },
    commands: { coil_14: coil14, coil_12: coil12 },
    state: spool === undefined ? {} : { spool },
    jointPositions: [],
    dt: 1 / 120,
  });
}

function table(type: ValveType, rows: Row[]) {
  it.each(rows)(`${type}: coils $coils from spool $spool`, (row) => {
    const output = run(type, row.coils, row.spool);
    expect(output.ports).toEqual(row.ports);
    expect(output.diagnostics).toEqual(row.diagnostics ?? []);
    if (row.spoolAfter !== undefined) {
      expect(output.state.spool).toBe(row.spoolAfter);
    }
  });
}

describe("valves", () => {
  it("3/2 single: coil 12 pressurises port 2, the spring exhausts it, no port 4", () => {
    expect(run("valve_3_2_single", [0, 1]).ports).toEqual({ port_2: "pressure" });
    expect(run("valve_3_2_single", [0, 0]).ports).toEqual({ port_2: "exhaust" });
  });

  table("valve_double_3_2", [
    { coils: [0, 0], spool: undefined, ports: both("exhaust") },
    { coils: [1, 0], spool: undefined, ports: { port_2: "exhaust", port_4: "pressure" } },
    { coils: [0, 1], spool: undefined, ports: { port_2: "pressure", port_4: "exhaust" } },
    { coils: [1, 1], spool: undefined, ports: both("pressure") },
  ]);

  table("valve_5_2_single", [
    { coils: [0, 0], spool: undefined, ports: P12 },
    { coils: [1, 0], spool: undefined, ports: P14 },
    { coils: [1, 0], spool: -1, ports: P14 },
    { coils: [0, 0], spool: 1, ports: P12 },
  ]);

  table("valve_5_2_double", [
    { coils: [0, 0], spool: undefined, ports: P12, spoolAfter: -1 },
    { coils: [1, 0], spool: -1, ports: P14, spoolAfter: 1 },
    { coils: [0, 0], spool: 1, ports: P14, spoolAfter: 1 },
    { coils: [0, 1], spool: 1, ports: P12, spoolAfter: -1 },
    // Both coils keep the position, without a diagnostic.
    { coils: [1, 1], spool: 1, ports: P14, spoolAfter: 1 },
    { coils: [1, 1], spool: -1, ports: P12, spoolAfter: -1 },
  ]);

  describe.each([
    ["valve_5_3_closed", "blocked"],
    ["valve_5_3_exhaust", "exhaust"],
    ["valve_5_3_pressure", "pressure"],
  ] as const)("%s", (type, centre) => {
    table(type, [
      { coils: [0, 0], spool: undefined, ports: both(centre), spoolAfter: 0 },
      { coils: [0, 0], spool: 1, ports: both(centre), spoolAfter: 0 },
      { coils: [1, 0], spool: 0, ports: P14, spoolAfter: 1 },
      { coils: [0, 1], spool: 0, ports: P12, spoolAfter: -1 },
      // Both coils keep the spool wherever it was, with the diagnostic.
      { coils: [1, 1], spool: 1, ports: P14, spoolAfter: 1, diagnostics: CONFLICT },
      { coils: [1, 1], spool: -1, ports: P12, spoolAfter: -1, diagnostics: CONFLICT },
      { coils: [1, 1], spool: 0, ports: both(centre), spoolAfter: 0, diagnostics: CONFLICT },
      { coils: [1, 1], spool: undefined, ports: both(centre), diagnostics: CONFLICT },
    ]);
  });

  it("a 5/3 valve moves again as soon as one coil falls", () => {
    const held = run("valve_5_3_closed", [1, 1], 1);
    expect(run("valve_5_3_closed", [0, 1], held.state.spool).ports).toEqual(P12);
  });
});
