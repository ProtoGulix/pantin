import { layoutChainDiagram } from "./chain-layout.ts";
import {
  actuatorOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram-fixtures.ts";

// A small machine with every case of wiring: two 5/2 valves, a 3/2 valve and a
// servo drive; a fed cylinder on a slide, a cylinder without feed, a servo
// motor on another slide, free joints (prismatic and revolute), a fixed joint
// and a sensor on the first slide.
export const wiringDocument = documentOf({
  assemblies: ["a"],
  bodies: [
    bodyOf("s1", "a"),
    bodyOf("s2", "a"),
    bodyOf("s3", "a"),
    bodyOf("sr", "a"),
    bodyOf("sf", "a"),
  ],
  joints: [
    jointOf("j1", "s1"),
    jointOf("j2", "s2"),
    jointOf("j3", "s3"),
    jointOf("jr", "sr", "revolute"),
    jointOf("jf", "sf", "fixed"),
  ],
  drives: [
    driveOf("v1", "a"),
    driveOf("v2", "a"),
    driveOf("v3", "a", "valve_3_2_single"),
    {
      id: "sv",
      tagKey: "sv",
      name: "sv",
      assembly: "a",
      type: "servo_drive",
      maxSpeed: 1,
      maxAcceleration: 1,
    },
  ],
  actuators: [
    cylinderOf("cyl1", "a", "v1", ["j1"]),
    cylinderOf("cyl2", "a", null, []),
    actuatorOf("motor", "a", { type: "servo_motor" }, { drive: "sv", ports: { in: "out" } }, [
      "j2",
    ]),
  ],
  sensors: [encoderOf("e1", "a", "j1")],
});

export const wiringDiagram = layoutChainDiagram(wiringDocument, new Set(), "en");
