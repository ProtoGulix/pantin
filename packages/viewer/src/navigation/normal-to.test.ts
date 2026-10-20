import { describe, expect, it } from "vitest";
import { newAlignmentSession } from "../alignment/alignment-session.ts";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { infoMessage } from "../messages.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  isPickingNormalTo,
  normalToDirectionOf,
  withNormalToRules,
  withNormalToToggled,
} from "./normal-to.ts";

const listing = { ...initialViewerState("fr"), pantins: pantinSummaries };
const editing = withOpenPantin(listing, pantinResponse(false));

describe("withNormalToToggled", () => {
  it("waits for a click once a Pantin is open, and the same command cancels", () => {
    const waiting = withNormalToToggled(editing);
    expect(isPickingNormalTo(waiting)).toBe(true);
    expect(isPickingNormalTo(withNormalToToggled(waiting))).toBe(false);
  });

  it("does nothing without a Pantin", () => {
    expect(withNormalToToggled(listing)).toBe(listing);
  });

  it("is the only tool on: the gizmo ends", () => {
    const busy = { ...editing, gizmoMode: "move" as const };
    expect(withNormalToToggled(busy)).toMatchObject({ normalTo: true, gizmoMode: null });
  });
});

describe("withNormalToRules", () => {
  const waiting = withNormalToToggled(editing);

  it("keeps the mode while nothing else starts", () => {
    expect(withNormalToRules(waiting)).toBe(waiting);
  });

  it("ends when another tool starts", () => {
    const aligning = { ...waiting, alignment: newAlignmentSession("press", "main") };
    expect(withNormalToRules(aligning).normalTo).toBe(false);
    expect(withNormalToRules({ ...waiting, gizmoMode: "rotate" }).normalTo).toBe(false);
  });

  it("takes its waiting hint away when it ends, and no other message", () => {
    const hinted = withNormalToToggled(editing);
    const hint = { ...hinted, message: infoMessage("message.normalToWaiting") };
    expect(withNormalToRules({ ...hint, gizmoMode: "move" }).message).toBeNull();
    const other = { ...hint, gizmoMode: "move" as const, message: infoMessage("message.saved") };
    expect(withNormalToRules(other).message).toEqual(infoMessage("message.saved"));
  });

  it("ends with its Pantin", () => {
    expect(withNormalToRules({ ...waiting, openPantin: null }).normalTo).toBe(false);
  });
});

describe("normalToDirectionOf", () => {
  it("is the normal of the clicked triangle, as seen from the camera", () => {
    const click: ViewportPick = {
      bodyId: "rail",
      meshIndex: 0,
      pointers: [],
      triangle: 0,
      point: [0, 0, 0],
      normal: [0, -1, 0],
    };
    expect(normalToDirectionOf(click)).toEqual([0, -1, 0]);
  });
});
