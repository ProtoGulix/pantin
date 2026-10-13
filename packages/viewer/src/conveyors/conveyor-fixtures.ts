import type {
  Absorber,
  Belt,
  Emitter,
  Guide,
  PantinResponse,
  Placement,
  PresenceSensor,
} from "@pantin/protocol";
import { pantinResponse, railBody, spinJoint, stepBody } from "../test-fixtures.ts";

// A Pantin with one object of each phase 6 kind, for the tests of the forms,
// the inspector and the actions. Metres, kilograms and radians, as the core sends them.

const raised: Placement = { translation: [0.1, 0.2, 0.5], rotation: [0, 0, 0, 1] };

export const feedBelt: Belt = {
  id: "feed",
  name: "Feed",
  assembly: "main",
  placement: raised,
  length: 1,
  width: 0.3,
  drumJoint: "spin",
  drumRadius: 0.05,
};

export const sideGuide: Guide = {
  id: "side",
  name: "Side",
  assembly: "main",
  placement: raised,
  size: [1, 0.02, 0.06],
};

export const cartonSource: Emitter = {
  id: "source",
  tagKey: "source",
  name: "Source",
  assembly: "main",
  body: "rail",
  placement: raised,
  box: { size: [0.2, 0.15, 0.1], mass: 0.5, material: "cardboard" },
};

export const exitSink: Absorber = {
  id: "sink",
  name: "Sink",
  assembly: "main",
  placement: raised,
  size: [0.2, 0.3, 0.1],
};

export const beamCell: PresenceSensor = {
  id: "cell",
  tagKey: "cell",
  name: "Cell",
  assembly: "main",
  placement: raised,
  type: "photoelectric",
  mode: "diffuse",
  range: 0.3,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0.05,
};

/** One Pantin with a drum joint, two bodies and one object of each kind. */
export function conveyorPantin(): PantinResponse {
  const base = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
    spinJoint,
  ]);
  return {
    ...base,
    document: {
      ...base.document,
      belts: [feedBelt],
      guides: [sideGuide],
      emitters: [cartonSource],
      absorbers: [exitSink],
      presenceSensors: [beamCell],
    },
  };
}
