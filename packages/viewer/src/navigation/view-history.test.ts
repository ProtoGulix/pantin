import { describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED_VIEWS,
  NO_VIEWS,
  sameView,
  startsGesture,
  stepBack,
  type ViewSnapshot,
  withViewRemembered,
} from "./view-history.ts";

function view(alpha: number, halfHeight = 1): ViewSnapshot {
  return { alpha, beta: 1, target: [0, 0, 0], halfHeight };
}

describe("withViewRemembered", () => {
  it("does not repeat the last view", () => {
    const once = withViewRemembered(NO_VIEWS, view(1));
    expect(withViewRemembered(once, view(1))).toBe(once);
  });

  it("keeps the newest views only", () => {
    let history = NO_VIEWS;
    for (let index = 0; index < MAX_REMEMBERED_VIEWS + 10; index += 1) {
      history = withViewRemembered(history, view(index));
    }
    expect(history).toHaveLength(MAX_REMEMBERED_VIEWS);
    expect(history[0]?.alpha).toBe(10);
  });
});

describe("stepBack", () => {
  it("returns the last view and the history without it", () => {
    const history = [view(1), view(2)];
    expect(stepBack(history, view(3))).toEqual({ history: [view(1)], view: view(2) });
  });

  it("skips views equal to the current one, as left by a click that moved nothing", () => {
    expect(stepBack([view(1), view(3)], view(3))).toEqual({ history: [], view: view(1) });
  });

  it("is null when nothing earlier exists", () => {
    expect(stepBack(NO_VIEWS, view(1))).toBeNull();
    expect(stepBack([view(1)], view(1))).toBeNull();
  });
});

describe("sameView", () => {
  it("compares angles, target and zoom", () => {
    expect(sameView(view(1), view(1))).toBe(true);
    expect(sameView(view(1), view(1, 2))).toBe(false);
    expect(sameView(view(1), { ...view(1), target: [0, 0, 1] })).toBe(false);
  });
});

describe("startsGesture", () => {
  it("starts on the first event and after a pause, not in the middle of a turn of the wheel", () => {
    expect(startsGesture(null, 1000)).toBe(true);
    expect(startsGesture(1000, 1100)).toBe(false);
    expect(startsGesture(1000, 1600)).toBe(true);
  });
});
