import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  type AlignmentPickState,
  newAlignmentSession,
  withCurrentPick,
  withKind,
  withPick,
} from "./alignment-session.ts";
import { alignmentHighlightsOf, buildAlignmentView, isAligning } from "./alignment-view.ts";

const t = createTranslator("fr");
const viewOf = (state: ReturnType<typeof opened>, clockRunning = false) =>
  buildAlignmentView(state, t, clockRunning);

function opened(joints: object[] = []) {
  const pantin: PantinResponse = {
    id: "bench",
    unsavedChanges: false,
    document: documentOf({
      assemblies: ["a", "block"],
      bodies: [bodyOf("post", "a"), bodyOf("block", "block")],
      joints,
    }),
  };
  return withOpenPantin(initialViewerState("fr"), pantin);
}

const blockPick: AlignmentPickState = {
  pick: { kind: "face", body: "block", face: 0, point: [0, 0, 0] },
  faceKind: "plane",
  highlight: {
    bodyId: "block",
    meshIndex: 0,
    firstTriangle: 0,
    triangleCount: 2,
    side: "moving",
  },
};

describe("buildAlignmentView", () => {
  it("lists the picks: done, the current one, then those waiting", () => {
    const session = withPick(
      withKind(newAlignmentSession("bench", "block"), "axis_around_pivot"),
      0,
      blockPick,
    );
    const view = viewOf({ ...opened(), alignment: session });
    expect(view?.steps.map((step) => step.status)).toEqual(["done", "current", "waiting"]);
    expect(view?.steps[0]?.detail).toBe("block : face plane");
    expect(view?.title).toBe("Aligner « BLOCK »");
  });

  it("shows a pick being replaced as the current one, the others stay done", () => {
    const done = withPick(newAlignmentSession("bench", "block"), 0, blockPick);
    const full = withPick(done, 1, { ...blockPick, pick: { ...blockPick.pick, body: "post" } });
    const steps = viewOf({ ...opened(), alignment: withCurrentPick(full, 0) })?.steps;
    expect(steps?.map((step) => step.status)).toEqual(["current", "done"]);
    expect(steps?.[0]?.detail).toBe("cliquez dans la vue 3D");
    // Both rows are buttons: the one being replaced cancels, the other switches.
    expect(steps?.map((step) => step.picked)).toEqual([true, true]);
    expect(viewOf({ ...opened(), alignment: full })?.applyEnabled).toBe(true);
    // Applying now would send the old face.
    expect(viewOf({ ...opened(), alignment: withCurrentPick(full, 0) })?.applyEnabled).toBe(false);
  });

  it("notes the running simulation only while the clock runs", () => {
    const state = { ...opened(), alignment: newAlignmentSession("bench", "block") };
    expect(viewOf(state)?.clockNote).toBeNull();
    expect(viewOf(state, true)?.clockNote).toContain("Simulation en marche");
  });
});

describe("buildAlignmentView parameters and joint", () => {
  it("shows only the parameters of the kind", () => {
    const pivot = withKind(newAlignmentSession("bench", "block"), "axis_around_pivot");
    const view = viewOf({ ...opened(), alignment: pivot });
    expect(view).toMatchObject({
      flip: null,
      offsetText: null,
      rotationText: "0",
      applyEnabled: false,
    });
  });

  it("turns the fixed joint off for an assembly that already hangs from another", () => {
    const anchored = opened([
      {
        ...jointOf("hold", "block", "fixed"),
        parent: { kind: "body", id: "post" },
        child: { kind: "assembly", key: "block" },
        name: "Maintien",
      },
    ]);
    const view = viewOf({ ...anchored, alignment: newAlignmentSession("bench", "block") });
    expect(view?.fixedJoint).toEqual({
      checked: false,
      enabled: false,
      note: "Déjà liée par « Maintien »",
    });
  });
});

describe("alignment session in the 3D view", () => {
  it("shows nothing for a session of another Pantin", () => {
    const state = { ...opened(), alignment: newAlignmentSession("other", "block") };
    expect(viewOf(state)).toBeNull();
    expect(isAligning(state)).toBe(false);
  });

  it("stops picking once the moving assembly is gone", () => {
    const state = { ...opened(), alignment: newAlignmentSession("bench", "deleted") };
    expect(isAligning(state)).toBe(false);
    expect(viewOf(state)).toBeNull();
  });

  it("tints the faces picked so far", () => {
    const session = withPick(newAlignmentSession("bench", "block"), 0, blockPick);
    expect(alignmentHighlightsOf({ ...opened(), alignment: session })).toEqual([
      blockPick.highlight,
    ]);
  });
});
