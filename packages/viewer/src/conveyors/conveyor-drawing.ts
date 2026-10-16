import {
  type Belt,
  type ObjectPose,
  type PantinDocument,
  PRESENCE_SENSOR_TAGS,
  type PresenceSensor,
  tagName,
} from "@pantin/protocol";
import { coreToBabylonPosition, type Vector3Tuple } from "../frames.ts";
import { objectKey } from "./pose-feed.ts";

// What the 3D view draws for belts, guides, emitters, absorbers and presence
// sensors (ADR 0043 point 13), as data. Every part is expressed in the
// BABYLON axes of the object's own frame: the object node takes the frame's
// pose through the one conversion boundary (frames.ts), so a part only needs
// the same axis swap as a position. Nothing here simulates: sizes and ranges
// come from the document as the core holds them.

export type VolumeStyle = "belt" | "guide" | "emitter" | "absorber" | "receiver";

export type DrawingPart =
  | { kind: "box"; style: VolumeStyle; size: Vector3Tuple; centre: Vector3Tuple }
  // A straight beam along Babylon Y, its middle at `centre`.
  | { kind: "beam"; length: number; diameter: number; centre: Vector3Tuple }
  // A travel arrow along +X, from its tail to the tip of its head.
  | {
      kind: "arrow";
      tail: Vector3Tuple;
      tip: Vector3Tuple;
      shaftDiameter: number;
      headDiameter: number;
      headLength: number;
    };

export interface DrawingItem {
  // "kind:id", the key of the object in the pose stream (objects[]).
  key: string;
  parts: DrawingPart[];
  // The bit that colours the beam; null for an object without one.
  stateTag: string | null;
}

// Same thickness as the belt collider (core/src/physics/rapier-world.ts); the
// top face is the frame origin.
export const BELT_THICKNESS = 0.05;
const BEAM_DIAMETER = 0.01;
const RECEIVER_SIZE = 0.04;
const ARROW_LENGTH_SHARE = 0.5;
const ARROW_MAX_LENGTH = 0.6;
const ARROW_WIDTH_SHARE = 0.07;

/** A box given in the core frame (size and centre), turned into the Babylon axes. */
function boxPart(style: VolumeStyle, size: Vector3Tuple, centre: Vector3Tuple): DrawingPart {
  const [width, height, depth] = coreToBabylonPosition(size);
  return {
    kind: "box",
    style,
    size: [width, height, depth],
    centre: coreToBabylonPosition(centre),
  };
}

/** A box standing on the frame's XY plane, centred on its Z axis (guide, emitter, absorber). */
export function standingBox(style: VolumeStyle, size: Vector3Tuple): DrawingPart {
  return boxPart(style, size, [0, 0, size[2] / 2]);
}

/**
 * The belt slab (top face at the origin) and an arrow on the surface along +X,
 * which is the way positive drum rotation carries products (point 3).
 */
export function beltParts(belt: Pick<Belt, "length" | "width">): DrawingPart[] {
  const slab = boxPart(
    "belt",
    [belt.length, belt.width, BELT_THICKNESS],
    [0, 0, -BELT_THICKNESS / 2],
  );
  const arrowLength = Math.min(belt.length * ARROW_LENGTH_SHARE, ARROW_MAX_LENGTH);
  const shaftDiameter = Math.max(belt.width * ARROW_WIDTH_SHARE, 0.004);
  const headDiameter = shaftDiameter * 3;
  const headLength = Math.min(headDiameter * 1.5, arrowLength / 2);
  // Resting on the surface: the arrow's axis is half its widest part above it.
  const lift = headDiameter / 2;
  return [
    slab,
    {
      kind: "arrow",
      tail: coreToBabylonPosition([-arrowLength / 2, 0, lift]),
      tip: coreToBabylonPosition([arrowLength / 2, 0, lift]),
      shaftDiameter,
      headDiameter,
      headLength,
    },
  ];
}

/** The beam runs from the frame origin along +Z for `range`; a through-beam barrier has a receiver at its end. */
export function beamParts(mode: "diffuse" | "through_beam", range: number): DrawingPart[] {
  const [, beamY] = coreToBabylonPosition([0, 0, range]);
  const beam: DrawingPart = {
    kind: "beam",
    length: range,
    diameter: BEAM_DIAMETER,
    centre: [0, beamY / 2, 0],
  };
  return mode === "through_beam"
    ? [
        beam,
        boxPart(
          "receiver",
          [RECEIVER_SIZE, RECEIVER_SIZE, RECEIVER_SIZE],
          [0, 0, range + RECEIVER_SIZE / 2],
        ),
      ]
    : [beam];
}

function stateTagOf(sensor: PresenceSensor): string | null {
  const bit = PRESENCE_SENSOR_TAGS[sensor.type].find((tag) => tag.type === "bit");
  return bit === undefined ? null : tagName(sensor.assembly, sensor.tagKey, bit.member);
}

/** Everything to draw for the document; where each stands comes from the pose stream. */
export function conveyorDrawingOf(document: PantinDocument | undefined): DrawingItem[] {
  if (document === undefined) {
    return [];
  }
  const item = (
    kind: ObjectPose["kind"],
    id: string,
    parts: DrawingPart[],
    stateTag: string | null = null,
  ): DrawingItem => ({ key: objectKey(kind, id), parts, stateTag });
  return [
    ...document.belts.map((belt) => item("belt", belt.id, beltParts(belt))),
    ...document.guides.map((guide) => item("guide", guide.id, [standingBox("guide", guide.size)])),
    ...document.emitters.map((emitter) =>
      item("emitter", emitter.id, [standingBox("emitter", emitter.box.size)]),
    ),
    ...document.absorbers.map((absorber) =>
      item("absorber", absorber.id, [standingBox("absorber", absorber.size)]),
    ),
    ...document.presenceSensors.map((sensor) =>
      item("presenceSensor", sensor.id, beamParts(sensor.mode, sensor.range), stateTagOf(sensor)),
    ),
  ];
}
