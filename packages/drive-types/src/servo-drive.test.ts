import { describe, expect, it } from "vitest";
import { stepNextDrive } from "./next-behaviours.ts";
import type { NextDriveFields } from "./next-schemas.ts";

const fields: NextDriveFields = { type: "servo_drive", maxSpeed: 0.5, maxAcceleration: 2 };

function step(commands: Record<string, number>, jointPositions: number[]) {
  return stepNextDrive({ fields, commands, state: {}, jointPositions, dt: 1 / 120 });
}

describe("servo drive", () => {
  it("hands its setpoint and limits to the servo port", () => {
    expect(step({ setpoint: 0.04 }, [0]).ports.out).toEqual({
      setpoint: 0.04,
      maxSpeed: 0.5,
      maxAcceleration: 2,
    });
  });

  it("reads a setpoint never written as 0, as the servo axis does", () => {
    expect(step({}, [0.02]).ports.out).toMatchObject({ setpoint: 0 });
  });

  it("reports the joint furthest from the setpoint, so a jammed one stays visible", () => {
    expect(step({ setpoint: 0.1 }, [0.1, 0.03, 0.09]).feedback.position).toBe(0.03);
    expect(step({ setpoint: 0 }, [0.01, -0.05]).feedback.position).toBe(-0.05);
  });

  it("reports the only joint's position, and the setpoint when it moves none", () => {
    expect(step({ setpoint: 0.1 }, [0.02]).feedback.position).toBe(0.02);
    expect(step({ setpoint: 0.1 }, []).feedback.position).toBe(0.1);
  });
});
