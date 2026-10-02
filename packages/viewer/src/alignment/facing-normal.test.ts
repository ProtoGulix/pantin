import { describe, expect, it } from "vitest";
import { normalFacingEye } from "./facing-normal.ts";

describe("normalFacingEye", () => {
  it("keeps a normal that points to the eye and turns one that points away", () => {
    expect(normalFacingEye([0, 0, 1], [0, 0, 0], [1, 2, 5])).toEqual([0, 0, 1]);
    expect(normalFacingEye([0, 0, 1], [0, 0, 0], [1, 2, -5])).toEqual([-0, -0, -1]);
  });
});
