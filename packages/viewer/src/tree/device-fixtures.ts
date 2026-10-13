import { type Actuator, DriveSchema, type PantinResponse, type Sensor } from "@pantin/protocol";
import { conveyorPantin } from "../conveyors/conveyor-fixtures.ts";

// The Pantin of conveyor-fixtures.ts, plus a drive, an actuator and a joint sensor,
// all in assembly "main": one element of each kind for the tests of the device rows.

const valve = DriveSchema.parse({
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "main",
  type: "valve_5_3_closed",
});

const cylinder: Actuator = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "main",
  joints: ["spin"],
  type: "ac_motor",
  nominalSpeed: 1,
};

const endSwitch: Sensor = {
  id: "end",
  tagKey: "end",
  name: "End",
  assembly: "main",
  joint: "spin",
  type: "limit_switch",
  operatingPosition: 0.1,
  differentialTravel: 0.01,
  overtravel: 0.02,
  normallyClosed: false,
};

export function devicePantin(): PantinResponse {
  const base = conveyorPantin();
  return {
    ...base,
    document: { ...base.document, drives: [valve], actuators: [cylinder], sensors: [endSwitch] },
  };
}
