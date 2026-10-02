import type { Placement } from "@pantin/protocol";
import { multiplyQuaternions, type QuaternionTuple, type Vector3Tuple } from "./frames.ts";
import {
  degreesToRadians,
  metresToMillimetres,
  millimetresToMetres,
  radiansToDegrees,
} from "./units.ts";

// A placement as the user types it (ADR 0034 points 1 and 2): X, Y, Z in
// millimetres and RX, RY, RZ in degrees, in the frame of the anchor. This is
// the one module that turns the document's quaternion into angles and back,
// next to the other unit conversions (units.ts, ADR 0016 point 4).
//
// Convention: extrinsic XYZ, that is a rotation about the FIXED X axis first,
// then about the fixed Y axis, then about the fixed Z axis of the anchor
// frame: R = Rz(rz) . Ry(ry) . Rx(rx). Changing it never touches the schema.

export interface PlacementFields {
  // Millimetres.
  x: number;
  y: number;
  z: number;
  // Degrees.
  rx: number;
  ry: number;
  rz: number;
}

export type PlacementField = keyof PlacementFields;

export const PLACEMENT_FIELDS: readonly PlacementField[] = ["x", "y", "z", "rx", "ry", "rz"];

// Below this cos(ry) the X and Z axes are almost aligned and only rx - rz (or
// rx + rz) is defined: rz is then taken as 0.
const GIMBAL_LOCK_COSINE = 1e-9;

function aboutAxis(axis: 0 | 1 | 2, radians: number): QuaternionTuple {
  const sine = Math.sin(radians / 2);
  const cosine = Math.cos(radians / 2);
  return [axis === 0 ? sine : 0, axis === 1 ? sine : 0, axis === 2 ? sine : 0, cosine];
}

/** Radians about fixed X, Y, Z (applied in that order) of a rotation quaternion [x, y, z, w]. */
function quaternionToAngles(quaternion: QuaternionTuple): Vector3Tuple {
  const length = Math.hypot(...quaternion);
  const x = quaternion[0] / length;
  const y = quaternion[1] / length;
  const z = quaternion[2] / length;
  const w = quaternion[3] / length;
  // Entries of R = Rz Ry Rx: R20 = -sin(ry), R00 = cos(ry) cos(rz), R10 = cos(ry) sin(rz).
  // ry comes from atan2, not asin: asin loses half its digits near +-90 degrees.
  const sineY = -2 * (x * z - w * y);
  const cosineY = Math.hypot(1 - 2 * (y * y + z * z), 2 * (x * y + w * z));
  const ry = Math.atan2(sineY, cosineY);
  if (cosineY < GIMBAL_LOCK_COSINE) {
    const r01 = 2 * (x * y - w * z);
    const r11 = 1 - 2 * (x * x + z * z);
    // R01 = sin(rx - rz) and R11 = cos(rx - rz) at ry = +90 degrees; at -90
    // they are -sin(rx + rz) and cos(rx + rz).
    return [Math.atan2(sineY > 0 ? r01 : -r01, r11), ry, 0];
  }
  return [
    Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y)),
    ry,
    Math.atan2(2 * (x * y + w * z), 1 - 2 * (y * y + z * z)),
  ];
}

function anglesToQuaternion(rx: number, ry: number, rz: number): QuaternionTuple {
  return multiplyQuaternions(
    aboutAxis(2, rz),
    multiplyQuaternions(aboutAxis(1, ry), aboutAxis(0, rx)),
  );
}

/** The six typed values of a stored placement. Full precision: rounding is for display only. */
export function placementToFields(placement: Placement): PlacementFields {
  const [x, y, z] = placement.translation;
  const [rx, ry, rz] = quaternionToAngles(placement.rotation);
  return {
    x: metresToMillimetres(x),
    y: metresToMillimetres(y),
    z: metresToMillimetres(z),
    rx: radiansToDegrees(rx),
    ry: radiansToDegrees(ry),
    rz: radiansToDegrees(rz),
  };
}

/** The placement to send (SI, unit quaternion) for six typed values. */
export function fieldsToPlacement(fields: PlacementFields): Placement {
  return {
    translation: [
      millimetresToMetres(fields.x),
      millimetresToMetres(fields.y),
      millimetresToMetres(fields.z),
    ],
    rotation: [
      ...anglesToQuaternion(
        degreesToRadians(fields.rx),
        degreesToRadians(fields.ry),
        degreesToRadians(fields.rz),
      ),
    ],
  };
}
