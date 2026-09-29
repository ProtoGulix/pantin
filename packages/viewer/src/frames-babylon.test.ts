import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { describe, expect, it } from "vitest";
import {
  babylonToCorePosition,
  coreToBabylonPosition,
  displacedNodePlacement,
  type QuaternionTuple,
  type Vector3Tuple,
} from "./frames.ts";

// Checks the frame maths against Babylon's own composition, not against a
// re-derivation: a displaced node must put every mesh point where the core's
// displacement puts it (ADR 0011 point 4, ADR 0015). Babylon stores its
// matrices in 32-bit floats: agreement to the micrometre is what can be asked.

function rotateInCore([qx, qy, qz, qw]: QuaternionTuple, [vx, vy, vz]: Vector3Tuple): Vector3Tuple {
  // v' = v + 2w (q × v) + 2 q × (q × v): the same formula as the core.
  const cx = qy * vz - qz * vy;
  const cy = qz * vx - qx * vz;
  const cz = qx * vy - qy * vx;
  return [
    vx + 2 * (qw * cx + qy * cz - qz * cy),
    vy + 2 * (qw * cy + qz * cx - qx * cz),
    vz + 2 * (qw * cz + qx * cy - qy * cx),
  ];
}

function worldPoint(rotation: QuaternionTuple, position: Vector3Tuple, local: Vector3Tuple) {
  const matrix = Matrix.Compose(
    new Vector3(0.001, 0.001, 0.001),
    new Quaternion(...rotation),
    new Vector3(...position),
  );
  const point = Vector3.TransformCoordinates(new Vector3(...local), matrix);
  return [point.x, point.y, point.z] as const;
}

describe("displaced node placement, through Babylon's matrices", () => {
  const reference: QuaternionTuple = [0.2705981, 0.2705981, -0.6532815, 0.6532815];
  const halfAngle = Math.PI / 6;
  // 60° about the core axis (1, 1, 1)/√3, then 0.1 m along core X and 0.05 m along core Z.
  const axisScale = Math.sin(halfAngle) / Math.sqrt(3);
  const coreRotation: QuaternionTuple = [axisScale, axisScale, axisScale, Math.cos(halfAngle)];
  const coreTranslation: Vector3Tuple = [0.1, 0, 0.05];

  const points: { local: Vector3Tuple }[] = [
    { local: [0, 0, 0] },
    { local: [120, -40, 15] },
    { local: [-3, 250, 80] },
  ];

  it.each(points)("moves the mesh point $local as the core displacement does", ({ local }) => {
    const before = babylonToCorePosition(worldPoint(reference, [0, 0, 0], local));
    const [rx, ry, rz] = rotateInCore(coreRotation, before);
    const expected = coreToBabylonPosition([
      rx + coreTranslation[0],
      ry + coreTranslation[1],
      rz + coreTranslation[2],
    ]);
    const placement = displacedNodePlacement(reference, coreTranslation, coreRotation);
    const actual = worldPoint(placement.rotation, placement.translation, local);
    actual.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 6);
    });
  });
});
