import { describe, expect, it } from "vitest";
import { inBodyFrame } from "./placement-frame.ts";

const QUARTER_TURN_Z: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

describe("inBodyFrame", () => {
  it("returns the same values for a body without placement", () => {
    const origin = [0.1, 0.2, 0.3] as const;
    const axis = [0, 0, 1] as const;
    const drawn = inBodyFrame(origin, axis, undefined);
    expect(drawn.origin).toBe(origin);
    expect(drawn.axis).toBe(axis);
  });

  it("undoes a translation of the body on the origin only", () => {
    const drawn = inBodyFrame([0.5, 0, 0], [1, 0, 0], {
      translation: [0.2, 0, 0.1],
      rotation: [0, 0, 0, 1],
    });
    expectClose(drawn.origin, [0.3, 0, -0.1]);
    expectClose(drawn.axis, [1, 0, 0]);
  });

  it("undoes a quarter turn about Z: the body frame is turned, the drawing turns back", () => {
    const drawn = inBodyFrame([1, 0, 0], [1, 0, 0], {
      translation: [0, 0, 0],
      rotation: QUARTER_TURN_Z,
    });
    expectClose(drawn.origin, [0, -1, 0]);
    expectClose(drawn.axis, [0, -1, 0]);
  });

  it("maps back to the assembly frame once B is applied again", () => {
    const placement = { translation: [0.3, -0.2, 0.1] as const, rotation: QUARTER_TURN_Z };
    const drawn = inBodyFrame([0.7, 0.4, 0.2], [0, 1, 0], placement);
    // B . drawn.origin = origin: rotate by the quarter turn, then translate.
    const [x, y, z] = drawn.origin;
    expectClose([-y + 0.3, x - 0.2, z + 0.1], [0.7, 0.4, 0.2]);
    expectClose([-drawn.axis[1], drawn.axis[0], drawn.axis[2]], [0, 1, 0]);
  });
});
