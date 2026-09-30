import { describe, expect, it } from "vitest";
import { stepNextDrive } from "./next-behaviours.ts";
import { NEXT_DRIVE_PORTS, type NextDriveFields, NextDriveFieldsSchema } from "./next-schemas.ts";
import { PORT_STATE_SCHEMAS, ServoStateSchema } from "./ports.ts";

// Every next drive type answers exactly the ports it declares, in its domain.

const FIELDS: NextDriveFields[] = [
  { type: "valve_3_2_single" },
  { type: "valve_double_3_2" },
  { type: "valve_5_2_single" },
  { type: "valve_5_2_double" },
  { type: "valve_5_3_closed" },
  { type: "valve_5_3_exhaust" },
  { type: "valve_5_3_pressure" },
  { type: "contactor" },
  { type: "reversing_contactor" },
  { type: "vfd_on_off", acceleration: 50 },
  { type: "vfd_analog", acceleration: 50 },
  { type: "servo_drive", maxSpeed: 1, maxAcceleration: 2 },
];

const COMMANDS = [
  {},
  { coil_14: 1, run: 1, forward: 1, speed_setpoint: 40, setpoint: 0.05 },
  { coil_12: 1, reverse: 1, speed_setpoint: -40 },
];

describe("next drive types", () => {
  it("covers every registered type", () => {
    expect(FIELDS.map((fields) => fields.type).sort()).toEqual(
      Object.keys(NEXT_DRIVE_PORTS).sort(),
    );
  });

  describe.each(FIELDS)("$type", (fields) => {
    it.each(COMMANDS)("answers its declared ports for %o", (commands) => {
      const output = stepNextDrive({
        fields,
        commands,
        state: {},
        jointPositions: [0],
        dt: 1 / 120,
      });
      const declared = NEXT_DRIVE_PORTS[fields.type];
      expect(Object.keys(output.ports).sort()).toEqual(declared.map((port) => port.name).sort());
      for (const port of declared) {
        expect(PORT_STATE_SCHEMAS[port.domain].safeParse(output.ports[port.name]).success).toBe(
          true,
        );
      }
    });
  });

  it("rejects a zero ramp or maximum speed", () => {
    expect(NextDriveFieldsSchema.safeParse({ type: "vfd_on_off", acceleration: 0 }).success).toBe(
      false,
    );
    expect(NextDriveFieldsSchema.safeParse({ type: "vfd_analog", acceleration: 0 }).success).toBe(
      false,
    );
    const servo = { type: "servo_drive", maxSpeed: 0, maxAcceleration: 1 };
    expect(NextDriveFieldsSchema.safeParse(servo).success).toBe(false);
  });
});

describe("servo port state", () => {
  it("rejects a zero or negative limit, which would make the profile NaN", () => {
    const valid = { setpoint: 1, maxSpeed: 1, maxAcceleration: 1 };
    expect(ServoStateSchema.safeParse(valid).success).toBe(true);
    expect(ServoStateSchema.safeParse({ ...valid, maxSpeed: 0 }).success).toBe(false);
    expect(ServoStateSchema.safeParse({ ...valid, maxAcceleration: -1 }).success).toBe(false);
  });
});
