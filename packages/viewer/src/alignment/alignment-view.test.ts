import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  type AlignmentPickState,
  newAlignmentSession,
  withKind,
  withPick,
} from "./alignment-session.ts";
import { alignmentHighlightsOf, buildAlignmentView, isAligning } from "./alignment-view.ts";

const t = createTranslator("fr");

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
    const view = buildAlignmentView({ ...opened(), alignment: session }, t);
    expect(view?.steps.map((step) => step.status)).toEqual(["done", "current", "waiting"]);
    expect(view?.steps[0]?.detail).toBe("block : face plane");
    expect(view?.title).toBe("Aligner « BLOCK »");
  });

  it("shows only the parameters of the kind", () => {
    const pivot = withKind(newAlignmentSession("bench", "block"), "axis_around_pivot");
    const view = buildAlignmentView({ ...opened(), alignment: pivot }, t);
    expect(view).toMatchObject({
      flip: null,
      offsetText: null,
      rotationText: "0",
      applyEnabled: false,
    });
  });

  it("turns the fixed joint off for an assembly that already hangs from another", () => {
    const anchored = opened([
      { ...jointOf("hold", "block", "fixed"), parent: "post", name: "Maintien" },
    ]);
    const view = buildAlignmentView(
      { ...anchored, alignment: newAlignmentSession("bench", "block") },
      t,
    );
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
    expect(buildAlignmentView(state, t)).toBeNull();
    expect(isAligning(state)).toBe(false);
  });

  it("stops picking once the moving assembly is gone", () => {
    const state = { ...opened(), alignment: newAlignmentSession("bench", "deleted") };
    expect(isAligning(state)).toBe(false);
    expect(buildAlignmentView(state, t)).toBeNull();
  });

  it("tints the faces picked so far", () => {
    const session = withPick(newAlignmentSession("bench", "block"), 0, blockPick);
    expect(alignmentHighlightsOf({ ...opened(), alignment: session })).toEqual([
      blockPick.highlight,
    ]);
  });
});
