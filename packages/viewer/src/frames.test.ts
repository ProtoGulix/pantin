import type { LengthUnit, MeshFormat, UpAxis } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  applyMatrix3,
  babylonToCorePosition,
  bodyNodeTransform,
  coreToBabylonPosition,
  fileToCoreMatrix,
  GLTF_LOADER_ROOT_MAPPING,
  LENGTH_UNIT_IN_METRES,
  type Matrix3,
  multiplyMatrix3,
  STL_LOADER_MAPPING,
  toBabylonMatrixArray,
  type Vector3Tuple,
} from "./frames.ts";

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
function fileToBabylon(format: MeshFormat, upAxis: UpAxis, unit: LengthUnit, point: Vector3Tuple) {
  const loader = format === "glb" ? GLTF_LOADER_ROOT_MAPPING : STL_LOADER_MAPPING;
  return applyMatrix3(bodyNodeTransform(format, upAxis, unit), applyMatrix3(loader, point));
}

const formats: MeshFormat[] = ["glb", "stl"];
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

  it("stands a Z-up CAD glTF upright", () => {
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
