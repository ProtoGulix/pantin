import { describe, expect, it } from "vitest";
import { stepNextDrive } from "./next-behaviours.ts";
import type { NextDriveFields } from "./next-schemas.ts";

// Contactors and variable speed drives at the core's rate (1/120 s, ADR 0005).

const DT = 1 / 120;

function step(fields: NextDriveFields, commands: Record<string, number>, state = {}) {
  return stepNextDrive({ fields, commands, state, jointPositions: [], dt: DT });
}

/** Runs `steps` steps with fixed commands from `state`. */
function run(fields: NextDriveFields, commands: Record<string, number>, steps: number, state = {}) {
  let output = step(fields, commands, state);
  for (let count = 1; count < steps; count += 1) {
    output = step(fields, commands, output.state);
  }
  return output;
}

const OPEN = { direction: 0, ratio: 0 };

describe("contactor", () => {
  const fields: NextDriveFields = { type: "contactor" };

  it("closes at the full ratio at once, opens without a ramp", () => {
    expect(step(fields, { run: 1 }).ports.out).toEqual({ direction: 1, ratio: 1 });
    expect(step(fields, { run: 0 }).ports.out).toEqual(OPEN);
  });
});

describe("reversing contactor", () => {
  const fields: NextDriveFields = { type: "reversing_contactor" };

  it("closes forward or reverse", () => {
    expect(step(fields, { forward: 1 }).ports.out).toEqual({ direction: 1, ratio: 1 });
    expect(step(fields, { reverse: 1 }).ports.out).toEqual({ direction: -1, ratio: 1 });
    expect(step(fields, {}).diagnostics).toEqual([]);
  });

  it("keeps the first closed while both are set, with a diagnostic", () => {
    const forward = step(fields, { forward: 1 });
    const held = step(fields, { forward: 1, reverse: 1 }, forward.state);
    expect(held.ports.out).toEqual({ direction: 1, ratio: 1 });
    expect(held.diagnostics).toEqual(["conflicting_commands"]);
    const reverse = step(fields, { reverse: 1 });
    expect(step(fields, { forward: 1, reverse: 1 }, reverse.state).ports.out).toEqual({
      direction: -1,
      ratio: 1,
    });
  });

  it("stays open when both are set from open, and moves again when one falls", () => {
    const held = step(fields, { forward: 1, reverse: 1 });
    expect(held.ports.out).toEqual(OPEN);
    expect(held.diagnostics).toEqual(["conflicting_commands"]);
    expect(step(fields, { reverse: 1 }, held.state).ports.out).toEqual({ direction: -1, ratio: 1 });
  });
});

describe("vfd_on_off", () => {
  const fields: NextDriveFields = { type: "vfd_on_off", acceleration: 120 };

  it("ramps to 100 % at its acceleration, feedback 0 to 100", () => {
    const output = run(fields, { run: 1 }, 60);
    expect(output.feedback.speed).toBeCloseTo(60);
    expect(output.ports.out).toEqual({ direction: 1, ratio: expect.closeTo(0.6) });
    expect(run(fields, { run: 1 }, 200).feedback.speed).toBe(100);
  });

  it("ramps down to 0 without run", () => {
    const output = run(fields, { run: 0 }, 60, { speed: 100 });
    expect(output.feedback.speed).toBeCloseTo(40);
    expect(run(fields, { run: 0 }, 200, { speed: 100 }).ports.out).toEqual(OPEN);
  });

  it("reverses through 0: the feedback stays a magnitude, the direction flips", () => {
    const early = run(fields, { run: 1, reverse: 1 }, 30, { speed: 100 });
    expect(early.ports.out).toMatchObject({ direction: 1 });
    expect(early.feedback.speed).toBeCloseTo(70);
    const late = run(fields, { run: 1, reverse: 1 }, 150, { speed: 100 });
    expect(late.ports.out).toMatchObject({ direction: -1 });
    expect(late.feedback.speed).toBeCloseTo(50);
  });
});

describe("vfd_analog", () => {
  const fields: NextDriveFields = { type: "vfd_analog", acceleration: 120 };

  it("follows a signed setpoint through its ramp, with a signed feedback", () => {
    const output = run(fields, { speed_setpoint: -50 }, 30);
    expect(output.feedback.speed).toBeCloseTo(-30);
    expect(output.ports.out).toEqual({ direction: -1, ratio: expect.closeTo(0.3) });
    expect(run(fields, { speed_setpoint: -50 }, 200).feedback.speed).toBe(-50);
  });

  it("clamps the setpoint to -100..100", () => {
    expect(run(fields, { speed_setpoint: 250 }, 400).feedback.speed).toBe(100);
    expect(run(fields, { speed_setpoint: -250 }, 400).ports.out).toEqual({
      direction: -1,
      ratio: 1,
    });
  });

  it("an unwritten setpoint ramps to 0", () => {
    expect(run(fields, {}, 400, { speed: 80 }).feedback.speed).toBe(0);
  });
});

describe("vfd_on_off without run", () => {
  it("ignores reverse: it stays at 0, and ramps to 0 from speed", () => {
    const fields: NextDriveFields = { type: "vfd_on_off", acceleration: 120 };
    expect(run(fields, { run: 0, reverse: 1 }, 10).ports.out).toEqual(OPEN);
    expect(run(fields, { run: 0, reverse: 1 }, 200, { speed: 100 }).feedback.speed).toBe(0);
  });
});
