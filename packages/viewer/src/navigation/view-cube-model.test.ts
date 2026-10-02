import { describe, expect, it } from "vitest";
import type { Vector3Tuple } from "../frames.ts";
import { anglesFromDirection, STANDARD_VIEWS } from "./standard-views.ts";
import {
  cellTransform,
  coreBasisOf,
  cubeCells,
  directionKey,
  faceLightness,
  triadSegments,
} from "./view-cube-model.ts";

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 4);
  });
}

function cellAt(face: string, column: number, row: number) {
  const found = cubeCells().find(
    (cell) => cell.face === face && cell.column === column && cell.row === row,
  );
  if (found === undefined) {
    throw new Error("no such cell");
  }
  return found;
}

function matrixOf(transform: string): number[] {
  return transform.replace("matrix3d(", "").replace(")", "").split(",").map(Number);
}

describe("cube cells", () => {
  const cells = cubeCells();

  it("has nine cells on each of the six faces", () => {
    expect(cells).toHaveLength(54);
    expect(cells.filter((cell) => cell.kind === "face")).toHaveLength(6);
    expect(cells.filter((cell) => cell.kind === "edge")).toHaveLength(24);
    expect(cells.filter((cell) => cell.kind === "corner")).toHaveLength(24);
  });

  it("asks for the standard view from the centre of a face", () => {
    for (const face of ["front", "back", "left", "right", "top", "bottom"] as const) {
      expectClose(cellAt(face, 0, 0).direction, STANDARD_VIEWS[face].camera);
    }
  });

  it("asks for the view from the edge between two faces", () => {
    const frontTopEdge = cellAt("front", 0, -1).direction;
    expectClose(frontTopEdge, [0, -Math.SQRT1_2, Math.SQRT1_2]);
    expect(directionKey(cellAt("top", 0, 1).direction)).toBe(directionKey(frontTopEdge));
  });

  it("asks for the isometric view from the front right top corner", () => {
    const corner = cellAt("front", 1, -1).direction;
    expectClose(corner, STANDARD_VIEWS.isometric.camera);
    expect(directionKey(cellAt("right", -1, -1).direction)).toBe(directionKey(corner));
    expect(directionKey(cellAt("top", 1, 1).direction)).toBe(directionKey(corner));
  });

  it("gives every edge and corner the same direction from each face that shows it", () => {
    const groups = new Map<string, number>();
    for (const cell of cells) {
      const key = directionKey(cell.direction);
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    // 6 faces once, 12 edges twice, 8 corners three times.
    expect(groups.size).toBe(26);
    expect([...groups.values()].sort()).toEqual(
      [...Array(6).fill(1), ...Array(12).fill(2), ...Array(8).fill(3)]
        .map(String)
        .sort()
        .map(Number),
    );
  });
});

describe("cell transform", () => {
  const frontView = (): ReturnType<typeof coreBasisOf> => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS.front.camera);
    return coreBasisOf(alpha, beta);
  };

  it("leaves the front face flat towards the viewer in the Front view", () => {
    const matrix = matrixOf(cellTransform(cellAt("front", 0, 0), frontView(), 32));
    expectClose(matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 48, 1]);
  });

  it("puts the Top face above the Front one in the Front view", () => {
    const matrix = matrixOf(cellTransform(cellAt("top", 0, 0), frontView(), 32));
    // Origin: 48 px up on screen (CSS y negative), no depth.
    expectClose(matrix.slice(12, 15), [0, -48, 0]);
  });

  it("puts the Back face behind, facing away", () => {
    const matrix = matrixOf(cellTransform(cellAt("back", 0, 0), frontView(), 32));
    expect(matrix[14]).toBeCloseTo(-48, 4);
    expect(matrix[10]).toBeCloseTo(-1, 4);
  });

  it("turns a face of the Right view towards the viewer", () => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS.right.camera);
    const matrix = matrixOf(cellTransform(cellAt("right", 0, 0), coreBasisOf(alpha, beta), 32));
    expectClose(matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 48, 1]);
  });

  it("keeps reading left to right on every face seen head on", () => {
    for (const id of ["front", "back", "left", "right", "top"] as const) {
      const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS[id].camera);
      const matrix = matrixOf(cellTransform(cellAt(id, 0, 0), coreBasisOf(alpha, beta), 32));
      expect(matrix[0]).toBeCloseTo(1, 2);
      expect(matrix[5]).toBeCloseTo(1, 2);
    }
  });
});

describe("types", () => {
  it("accepts a core direction tuple", () => {
    const direction: Vector3Tuple = [0, -1, 0];
    expect(directionKey(direction)).toBe("0.000,-1.000,0.000");
  });
});

describe("face lightness", () => {
  const basisOf = (id: "front" | "right" | "top" | "isometric") => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS[id].camera);
    return coreBasisOf(alpha, beta);
  };

  it("stays in the light grey range", () => {
    for (const face of ["front", "back", "left", "right", "top", "bottom"] as const) {
      const lightness = faceLightness(basisOf("isometric"), STANDARD_VIEWS[face].camera);
      expect(lightness).toBeGreaterThanOrEqual(70);
      expect(lightness).toBeLessThanOrEqual(92);
    }
  });

  it("tells the three faces of the isometric view apart", () => {
    const basis = basisOf("isometric");
    const shades = (["front", "right", "top"] as const).map((face) =>
      faceLightness(basis, STANDARD_VIEWS[face].camera),
    );
    expect(new Set(shades.map((value) => value.toFixed(2))).size).toBe(3);
  });

  it("lights the face that looks at the viewer more than one seen edge on", () => {
    const front = basisOf("front");
    expect(faceLightness(front, STANDARD_VIEWS.front.camera)).toBeGreaterThan(
      faceLightness(front, STANDARD_VIEWS.right.camera),
    );
  });

  it("lights a face turned towards the light's side more than the opposite side", () => {
    const front = basisOf("front");
    // The light comes from the upper left: Top (up) and Left are brighter than Bottom and Right.
    expect(faceLightness(front, STANDARD_VIEWS.top.camera)).toBeGreaterThan(
      faceLightness(front, STANDARD_VIEWS.bottom.camera),
    );
    expect(faceLightness(front, STANDARD_VIEWS.left.camera)).toBeGreaterThan(
      faceLightness(front, STANDARD_VIEWS.right.camera),
    );
  });
});

describe("triad", () => {
  it("runs along +X to the right and +Z up on screen in the Front view", () => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS.front.camera);
    const [x, , z] = triadSegments(coreBasisOf(alpha, beta), 30, 36);
    expect(x?.to.x).toBeCloseTo((x?.from.x ?? 0) + 36, 4);
    expect(x?.to.y).toBeCloseTo(x?.from.y ?? 0, 4);
    expect(z?.to.x).toBeCloseTo(z?.from.x ?? 0, 4);
    // Up on screen is negative CSS y.
    expect(z?.to.y).toBeCloseTo((z?.from.y ?? 0) - 36, 4);
  });

  it("starts the three axes at the same corner, the bottom left of the Front view", () => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS.front.camera);
    const segments = triadSegments(coreBasisOf(alpha, beta), 30, 36);
    for (const segment of segments) {
      expect(segment.from.x).toBeCloseTo(-30, 4);
      expect(segment.from.y).toBeCloseTo(30, 4);
    }
  });

  it("shows three distinct axes in the isometric view", () => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS.isometric.camera);
    const ends = triadSegments(coreBasisOf(alpha, beta), 30, 36).map(
      (segment) => `${segment.to.x.toFixed(1)},${segment.to.y.toFixed(1)}`,
    );
    expect(new Set(ends).size).toBe(3);
  });

  it.each([
    ["front", "y"],
    ["back", "y"],
    ["right", "x"],
    ["left", "x"],
    ["top", "z"],
    ["bottom", "z"],
  ] as const)("hides the axis seen end on in the %s view", (view, endOn) => {
    const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS[view].camera);
    const segments = triadSegments(coreBasisOf(alpha, beta), 30, 81);
    for (const segment of segments) {
      expect(segment.visible).toBe(segment.axis !== endOn);
    }
  });
});
