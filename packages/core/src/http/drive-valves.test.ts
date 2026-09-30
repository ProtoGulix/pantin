import { afterEach, describe, expect, it } from "vitest";
import { CYLINDER, type CylinderAxis, startCylinderAxis } from "../test-support/cylinder-axis.ts";

// The phase 4 exit scenario again (ADR 0028), built over REST with each valve
// type feeding a double-acting cylinder, and the 3/2 valve a single-acting
// one: the same cylinder behaves as its valve dictates. The rod starts
// retracted, goes half way with coil_14 set, and then the coil falls.

let axis: CylinderAxis | undefined;

afterEach(async () => {
  await axis?.close();
  axis = undefined;
});

async function start(driveType: string): Promise<CylinderAxis> {
  const drive = { name: "Valve", assembly: "carriage", type: driveType };
  axis = await startCylinderAxis({ chain: { drive, actuator: CYLINDER } });
  return axis;
}

// What the rod does once the coil has fallen mid-stroke: holds where it is
// (closed or exhausted centre, both 3/2 valves exhausted), goes back (spring),
// or goes on (a pressurised centre, or a valve that keeps its spool).
const AFTER_RELEASE = {
  valve_5_2_single: 0,
  valve_5_2_double: 0.1,
  valve_5_3_closed: 0.05,
  valve_5_3_exhaust: 0.05,
  valve_5_3_pressure: 0.1,
  valve_double_3_2: 0.05,
} as const;

describe.each(Object.entries(AFTER_RELEASE))(
  "%s feeding a double-acting cylinder",
  (type, resting) => {
    it("extends with coil_14 and does what its valve does when the coil falls", async () => {
      const running = await start(type);
      await running.writeTag("carriage.valve.coil_14", 1);
      running.runSeconds(0.25);
      expect(await running.strokePosition()).toBeCloseTo(0.05, 2);
      await running.writeTag("carriage.valve.coil_14", 0);
      running.runSeconds(0.6);
      expect(await running.strokePosition()).toBeCloseTo(resting, 2);
    });
  },
);

describe.each([
  "valve_5_2_double",
  "valve_5_3_closed",
  "valve_5_3_exhaust",
  "valve_5_3_pressure",
  "valve_double_3_2",
])("%s with its second coil", (type) => {
  it("retracts the cylinder with coil_12", async () => {
    const running = await start(type);
    await running.writeTag("carriage.valve.coil_14", 1);
    running.runSeconds(0.6);
    await running.writeTag("carriage.valve.coil_14", 0);
    await running.writeTag("carriage.valve.coil_12", 1);
    running.runSeconds(0.6);
    expect(await running.strokePosition()).toBe(0);
  });
});

describe("valve_3_2_single feeding a single-acting cylinder", () => {
  it("extends with coil_12 and returns on its spring when the coil falls", async () => {
    const drive = { name: "Valve", assembly: "carriage", type: "valve_3_2_single" };
    const actuator = {
      ...CYLINDER,
      type: "single_acting_cylinder",
      returnSpeed: 0.2,
      retractSpeed: undefined,
      feed: { drive: "valve", ports: { cap: "port_2" } },
    };
    axis = await startCylinderAxis({ chain: { drive, actuator } });
    await axis.writeTag("carriage.valve.coil_12", 1);
    axis.runSeconds(0.6);
    expect(await axis.strokePosition()).toBe(0.1);
    await axis.writeTag("carriage.valve.coil_12", 0);
    axis.runSeconds(0.6);
    expect(await axis.strokePosition()).toBe(0);
  });
});
