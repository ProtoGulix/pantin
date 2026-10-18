import {
  bodyEndpoint,
  groupEndpoint,
  type Joint,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { belt, photoelectricCell } from "./conveyor-fixtures.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  joint,
} from "./placed-fixtures.ts";

// Documents for "align the frames on a joint axis" (ADR 0056): the assembly
// "top" holds rails and is placed tilted 70° about Y; a carriage group "g"
// slides on them along an axis [0.94, 0, 0.34] of the frame of "top" (the
// frames come from the CAD and are not aligned on the rails).

const TILT = (70 * Math.PI) / 180;
const TILTED: Placement = {
  translation: [0.2, 0.1, 0.3],
  rotation: [0, Math.sin(TILT / 2), 0, Math.cos(TILT / 2)],
};

const RAILS_ANGLE = (20 * Math.PI) / 180;
export const RAILS_AXIS: [number, number, number] = [
  Math.cos(RAILS_ANGLE),
  0,
  Math.sin(RAILS_ANGLE),
];

export const ALIGN_POSITIONS = new Map([
  ["slide", 0.15],
  ["hinge", 1],
  ["extend", 0.05],
  ["top-hinge", -0.4],
]);

// "top" holds the rails and an arm turning on them; "g" holds a body "g1", a
// body "g2" turning on it, and an assembly "sub" slides from "g1". The belt
// "far" holds a pivot outside both, "idle" has no joint. The belt
// is framed in "g" without body, the cell on "g2".
function alignJoints(): Joint[] {
  return [
    joint({
      id: "slide",
      type: "prismatic",
      axis: RAILS_AXIS,
      origin: [0.1, 0, 0.2],
      limits: [0, 0.5],
      parent: bodyEndpoint("rails"),
      child: groupEndpoint("g"),
    }),
    joint({
      id: "far-hinge",
      axis: [0, 1, 0],
      parent: bodyEndpoint("far1"),
      child: bodyEndpoint("far2"),
    }),
    joint({
      id: "top-hinge",
      axis: [0, 1, 0],
      parent: bodyEndpoint("rails"),
      child: bodyEndpoint("arm"),
    }),
    joint({
      id: "hinge",
      axis: [1, 0, 0],
      parent: bodyEndpoint("g1"),
      child: bodyEndpoint("g2"),
    }),
    joint({
      id: "extend",
      type: "prismatic",
      axis: [0, 1, 0],
      limits: [0, 1],
      parent: bodyEndpoint("g1"),
      child: groupEndpoint("sub"),
    }),
  ];
}

export function alignDocument(): PantinDocument {
  return documentOf(
    alignJoints(),
    [
      body("far1", "far"),
      body("far2", "far", ABOUT_X),
      body("idle1", "idle", ABOUT_Z),
      body("rails", "top", ABOUT_X),
      body("arm", "top"),
      body("g1", "g", ABOUT_Z),
      body("g2", "g", ABOUT_DIAGONAL),
      body("s1", "sub", ABOUT_X),
    ],
    [
      assembly("top", TILTED),
      assembly("far", ABOUT_X),
      assembly("idle", ABOUT_DIAGONAL),
      assembly("g", ABOUT_DIAGONAL),
      assembly("sub", ABOUT_Z),
    ],
    {
      belts: [belt({ id: "feed", assembly: "g", placement: ABOUT_X, drumJoint: "hinge" })],
      presenceSensors: [photoelectricCell({ assembly: "g", body: "g2", placement: ABOUT_Z })],
    },
  );
}
