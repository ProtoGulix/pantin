import { describe, expect, it } from "vitest";
import {
  type AlignmentPickState,
  alignRequestOf,
  newAlignmentSession,
  nextPickIndex,
  withKind,
  withPick,
} from "./alignment-session.ts";

function facePick(body: string, face: number): AlignmentPickState {
  return {
    pick: { kind: "face", body, face, point: [0, 0, 0] },
    faceKind: "plane",
    highlight: { bodyId: body, meshIndex: 0, firstTriangle: 0, triangleCount: 1, side: "moving" },
  };
}

const twoPicks = withPick(
  withPick(newAlignmentSession("bench", "block"), 0, facePick("block", 0)),
  1,
  facePick("base", 0),
);

describe("alignment session", () => {
  it("fills the picks in order and starts over with another kind", () => {
    const session = newAlignmentSession("bench", "block");
    expect(nextPickIndex(session)).toBe(0);
    expect(nextPickIndex(twoPicks)).toBeNull();
    expect(withKind(twoPicks, "axis_around_pivot").picks).toEqual([null, null, null]);
  });

  it("sends millimetres as metres and degrees as radians", () => {
    const outcome = alignRequestOf({
      ...twoPicks,
      flip: true,
      offsetText: "2,5",
      rotationText: "90",
    });
    expect(outcome).toMatchObject({
      ok: true,
      request: { kind: "plane_on_plane", flip: true, offset: 0.0025 },
    });
    expect(outcome.ok && outcome.request.rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it("sends only the parameters the kind has", () => {
    const pivot = withKind(twoPicks, "axis_around_pivot");
    const full = [0, 1, 2].reduce(
      (session, index) => withPick(session, index, facePick("b", 1)),
      pivot,
    );
    const outcome = alignRequestOf({ ...full, flip: true, offsetText: "3" });
    expect(outcome.ok && outcome.request).toEqual({
      kind: "axis_around_pivot",
      picks: full.picks.map((state) => state?.pick),
      rotation: 0,
    });
  });

  it("says what is missing or wrong", () => {
    expect(alignRequestOf(newAlignmentSession("bench", "block"))).toEqual({
      ok: false,
      reason: "missingPicks",
    });
    expect(alignRequestOf({ ...twoPicks, offsetText: "abc" })).toEqual({
      ok: false,
      reason: "invalidOffset",
    });
  });
});
