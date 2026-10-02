import type { LengthUnit, UpAxis } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  applyMatrix3,
  babylonDisplacementToCore,
  babylonToCorePosition,
  bodyNodeTransform,
  coreDisplacementToBabylon,
  coreToBabylonPosition,
  displacedNodePlacement,
  fileToCoreMatrix,
  GLTF_LOADER_ROOT_MAPPING,
  LENGTH_UNIT_IN_METRES,
  type Matrix3,
  multiplyMatrix3,
  multiplyQuaternions,
  type QuaternionTuple,
  STL_LOADER_MAPPING,
  toBabylonMatrixArray,
  type Vector3Tuple,
} from "./frames.ts";
import type { MeshFileFormat } from "./mesh-format.ts";

function expectClose(actual: Vector3Tuple, expected: Vector3Tuple): void {
  for (const axis of [0, 1, 2] as const) {
    expect(actual[axis]).toBeCloseTo(expected[axis], 12);
  }
}

function determinant(matrix: Matrix3): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

// What a loaded vertex ends up at in Babylon: loader mapping, then our parent.
function fileToBabylon(
  format: MeshFileFormat,
  upAxis: UpAxis,
  unit: LengthUnit,
  point: Vector3Tuple,
) {
  const loader = format === "glb" ? GLTF_LOADER_ROOT_MAPPING : STL_LOADER_MAPPING;
  return applyMatrix3(bodyNodeTransform(format, upAxis, unit), applyMatrix3(loader, point));
}

const formats: MeshFileFormat[] = ["glb", "stl"];
const upAxes: UpAxis[] = ["y", "z"];
const units: LengthUnit[] = ["m", "mm", "cm", "in"];

describe("core <-> Babylon positions", () => {
  it("maps core (1, 2, 3) to Babylon (1, 3, 2): core Z up becomes Babylon Y up", () => {
    expect(coreToBabylonPosition([1, 2, 3])).toEqual([1, 3, 2]);
  });

  it("maps the core up axis to the Babylon up axis", () => {
    expect(coreToBabylonPosition([0, 0, 1])).toEqual([0, 1, 0]);
  });

  it("round trips in both directions", () => {
    const point: Vector3Tuple = [-0.4, 0.25, 1.23];
    expect(babylonToCorePosition(coreToBabylonPosition(point))).toEqual(point);
    expect(coreToBabylonPosition(babylonToCorePosition(point))).toEqual(point);
  });
});

describe("unit factors", () => {
  it("converts every unit to metres", () => {
    expect(LENGTH_UNIT_IN_METRES).toEqual({ m: 1, mm: 0.001, cm: 0.01, in: 0.0254 });
  });

  it("scales a Z-up file point without rotating it", () => {
    expectClose(applyMatrix3(fileToCoreMatrix("z", "mm"), [1000, 20, 30]), [1, 0.02, 0.03]);
    expectClose(applyMatrix3(fileToCoreMatrix("z", "in"), [10, 0, 0]), [0.254, 0, 0]);
  });
});

describe("file up axis", () => {
  it("turns a Y-up file's up (+Y) into core up (+Z)", () => {
    expectClose(applyMatrix3(fileToCoreMatrix("y", "m"), [0, 1, 0]), [0, 0, 1]);
  });

  it("turns a Y-up file's front (+Z) into core -Y, as Blender does", () => {
    expectClose(applyMatrix3(fileToCoreMatrix("y", "m"), [0, 0, 1]), [0, -1, 0]);
  });

  it("keeps X for both up axes", () => {
    expectClose(applyMatrix3(fileToCoreMatrix("y", "cm"), [100, 0, 0]), [1, 0, 0]);
    expectClose(applyMatrix3(fileToCoreMatrix("z", "cm"), [100, 0, 0]), [1, 0, 0]);
  });
});

describe("body node transform compensates the Babylon loaders", () => {
  it.each(
    formats.flatMap((format) =>
      upAxes.flatMap((upAxis) => units.map((unit) => ({ format, upAxis, unit }))),
    ),
  )(
    "$format, $upAxis up, $unit: loaded vertex lands where the core frame says",
    ({ format, upAxis, unit }) => {
      for (const point of [
        [1, 2, 3],
        [-4, 0.5, 7],
        [0, 0, 1],
      ] as Vector3Tuple[]) {
        const expected = coreToBabylonPosition(applyMatrix3(fileToCoreMatrix(upAxis, unit), point));
        expectClose(fileToBabylon(format, upAxis, unit, point), expected);
      }
    },
  );

  it.each(formats.flatMap((format) => upAxes.map((upAxis) => ({ format, upAxis }))))(
    "$format, $upAxis up: is a proper rotation (keeps back-face culling right)",
    ({ format, upAxis }) => {
      expect(determinant(bodyNodeTransform(format, upAxis, "m"))).toBeCloseTo(1, 12);
    },
  );

  it("is the identity for a Z-up STL in metres: the loader swap is already our swap", () => {
    expect(bodyNodeTransform("stl", "z", "m")).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("puts a Z-up STL in mm at the expected Babylon position", () => {
    // Core point (0.01, 0.02, 0.03) m is Babylon (0.01, 0.03, 0.02).
    expectClose(fileToBabylon("stl", "z", "mm", [10, 20, 30]), [0.01, 0.03, 0.02]);
  });

  it("keeps a standard Y-up glTF upright", () => {
    expectClose(fileToBabylon("glb", "y", "m", [0, 1, 0]), [0, 1, 0]);
  });

  it("stands a Z-up CAD glTF upright, such as a STEP-derived body", () => {
    expectClose(fileToBabylon("glb", "z", "m", [0, 0, 1]), [0, 1, 0]);
  });
});

describe("Babylon matrix layout", () => {
  it("transposes into Babylon's row-vector layout", () => {
    const matrix: Matrix3 = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    expect(toBabylonMatrixArray(matrix)).toEqual([1, 4, 7, 0, 2, 5, 8, 0, 3, 6, 9, 0, 0, 0, 0, 1]);
  });

  it("composes like the column-vector product", () => {
    const rotation = bodyNodeTransform("glb", "z", "mm");
    const product = multiplyMatrix3(rotation, GLTF_LOADER_ROOT_MAPPING);
    expectClose(applyMatrix3(product, [1, 2, 3]), fileToBabylon("glb", "z", "mm", [1, 2, 3]));
  });
});

function rotateByQuaternion(q: QuaternionTuple, point: Vector3Tuple): Vector3Tuple {
  // q * (0, p) * conjugate(q)
  const conjugate: QuaternionTuple = [-q[0], -q[1], -q[2], q[3]];
  const result = multiplyQuaternions(multiplyQuaternions(q, [...point, 0]), conjugate);
  return [result[0], result[1], result[2]];
}

describe("core displacement in Babylon", () => {
  const half = Math.SQRT1_2;
  const quarterTurnAboutCoreZ: QuaternionTuple = [0, 0, half, half];

  it("maps a 90 degree rotation about core Z to a -90 degree rotation about Babylon Y", () => {
    const { rotation, translation } = coreDisplacementToBabylon([0, 0, 0], quarterTurnAboutCoreZ);
    expect(rotation[0]).toBeCloseTo(0, 12);
    expect(rotation[1]).toBeCloseTo(-half, 12);
    expect(rotation[2]).toBeCloseTo(0, 12);
    expect(rotation[3]).toBeCloseTo(half, 12);
    expectClose(translation, [0, 0, 0]);
  });

  it("moves points exactly as the core rotation moves them, seen through the swap", () => {
    const corePoint: Vector3Tuple = [1, 2, 3];
    // Core: 90 degrees about Z sends (x, y, z) to (-y, x, z).
    const expectedCore: Vector3Tuple = [-2, 1, 3];
    const { rotation } = coreDisplacementToBabylon([0, 0, 0], quarterTurnAboutCoreZ);
    const moved = rotateByQuaternion(rotation, coreToBabylonPosition(corePoint));
    expectClose(moved, coreToBabylonPosition(expectedCore));
  });

  it("maps a translation along core X to Babylon X and core Z to Babylon Y", () => {
    const identity: QuaternionTuple = [0, 0, 0, 1];
    expectClose(coreDisplacementToBabylon([0.5, 0, 0], identity).translation, [0.5, 0, 0]);
    expectClose(coreDisplacementToBabylon([0, 0, 0.5], identity).translation, [0, 0.5, 0]);
  });

  it("leaves the reference placement untouched for the identity displacement", () => {
    const reference: QuaternionTuple = [0.5, 0.5, -0.5, 0.5];
    const placed = displacedNodePlacement(reference, [0, 0, 0], [0, 0, 0, 1]);
    expect(placed.rotation).toEqual(reference);
    expectClose(placed.translation, [0, 0, 0]);
  });
});

describe("core displacement composed with the reference placement", () => {
  const half = Math.SQRT1_2;
  const quarterTurnAboutCoreZ: QuaternionTuple = [0, 0, half, half];

  it("composes so that the reference placement acts first, the displacement second", () => {
    const reference: QuaternionTuple = [half, 0, 0, half];
    const displacement = coreDisplacementToBabylon([0, 0, 0], quarterTurnAboutCoreZ).rotation;
    const point: Vector3Tuple = [0.3, -0.7, 1.1];
    const composed = displacedNodePlacement(reference, [0, 0, 0], quarterTurnAboutCoreZ).rotation;
    expectClose(
      rotateByQuaternion(composed, point),
      rotateByQuaternion(displacement, rotateByQuaternion(reference, point)),
    );
  });

  it("applies the displacement in world space on top of the reference placement", () => {
    // A vertex at file (1, 0, 0) of a Z-up metre STL, displaced by 90 degrees
    // about core Z then 0.25 m along core X: core (1,0,0) -> (0,1,0) -> (0.25,1,0).
    const format = "stl";
    const matrix = bodyNodeTransform(format, "z", "m");
    // Rotation part of N, as body-loader decomposes it (uniform scale 1 here).
    const reference = matrixToQuaternion(matrix);
    const placed = displacedNodePlacement(reference, [0.25, 0, 0], quarterTurnAboutCoreZ);
    const loaded = applyMatrix3(STL_LOADER_MAPPING, [1, 0, 0]);
    const inBabylon = rotateByQuaternion(placed.rotation, applyMatrix3(matrix, loaded));
    const world: Vector3Tuple = [
      inBabylon[0] + placed.translation[0],
      inBabylon[1] + placed.translation[1],
      inBabylon[2] + placed.translation[2],
    ];
    expectClose(world, coreToBabylonPosition([0.25, 1, 0]));
  });
});

// Enough for the identity-like STL mapping used above: N = C * I * C^T = identity.
function matrixToQuaternion(matrix: Matrix3): QuaternionTuple {
  expectClose(matrix[0], [1, 0, 0]);
  expectClose(matrix[1], [0, 1, 0]);
  expectClose(matrix[2], [0, 0, 1]);
  return [0, 0, 0, 1];
}

describe("babylonDisplacementToCore", () => {
  it("undoes coreDisplacementToBabylon", () => {
    const rotation: QuaternionTuple = [0.1, -0.5, 0.3, Math.sqrt(1 - 0.35)];
    const translation: Vector3Tuple = [0.2, -0.4, 0.9];
    const inBabylon = coreDisplacementToBabylon(translation, rotation);
    const back = babylonDisplacementToCore(inBabylon.translation, inBabylon.rotation);
    expect(back.translation).toEqual(translation);
    expect(back.rotation).toEqual(rotation);
  });
});
