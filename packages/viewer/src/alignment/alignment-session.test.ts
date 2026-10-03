import { describe, expect, it } from "vitest";
import {
  type AlignmentPickState,
  alignRequestOf,
  newAlignmentSession,
  nextPickIndex,
  withCurrentPick,
  withKind,
  withoutPicks,
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

describe("replacing a pick", () => {
  it("replaces a chosen pick, keeps the others, then follows the next missing one", () => {
    const repicking = withCurrentPick(twoPicks, 0);
    expect(nextPickIndex(repicking)).toBe(0);
    const replaced = withPick(repicking, 0, facePick("block", 7));
    expect(replaced.picks.map((state) => state?.pick)).toEqual([
      facePick("block", 7).pick,
      facePick("base", 0).pick,
    ]);
    expect(replaced.currentPick).toBeNull();
    expect(nextPickIndex(replaced)).toBeNull();
    const partial = withCurrentPick(
      withPick(newAlignmentSession("bench", "block"), 0, facePick("block", 0)),
      0,
    );
    expect(nextPickIndex(withPick(partial, 0, facePick("block", 1)))).toBe(1);
  });

  it("cancels the re-pick when the same pick is chosen again, keeping the old pick", () => {
    const cancelled = withCurrentPick(withCurrentPick(twoPicks, 0), 0);
    expect(cancelled.currentPick).toBeNull();
    expect(cancelled.picks).toBe(twoPicks.picks);
    expect(nextPickIndex(cancelled)).toBeNull();
  });

  it("ignores a pick that does not exist and drops it with the kind or a restart", () => {
    expect(withCurrentPick(twoPicks, 5)).toBe(twoPicks);
    expect(withKind(withCurrentPick(twoPicks, 1), "axis_on_axis").currentPick).toBeNull();
    expect(withoutPicks(withCurrentPick(twoPicks, 1)).currentPick).toBeNull();
  });
});
