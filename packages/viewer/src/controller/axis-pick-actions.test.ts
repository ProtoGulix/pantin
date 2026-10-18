import type { Joint } from "@pantin/protocol";
import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { isPickingAxis } from "../joints/axis-pick.ts";
import { withNode } from "../test-fixtures.ts";
import { assemblyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { toggleAlignment } from "./alignment-actions.ts";
import { alignmentStore, click, PANTIN } from "./alignment-test-helpers.ts";
import { receiveViewportPick, startAxisPick } from "./axis-pick-actions.ts";
import { toggleGizmo, turnToolOff } from "./gizmo-actions.ts";
import { cancelJointForm, openJointEditForm } from "./joint-actions.ts";

// "Prendre l'axe sur une face" (ADR 0041 points 1 and 3): one pick, the core's
// answer in the form, nothing saved.

const JOINT: Joint = {
  id: "rod",
  tagKey: "rod",
  name: "Rod",
  type: "prismatic",
  parent: bodyEndpoint("frame"),
  child: bodyEndpoint("block"),
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  limits: [0, 0.1],
};

function axisStore(answer: () => Promise<{ origin: number[]; axis: number[] }>) {
  const pantin = { ...PANTIN, document: { ...PANTIN.document, joints: [JOINT] } };
  const jointAxisFromFace = vi.fn(answer);
  const { store, fetchFaceFile } = alignmentStore();
  store.ports.api.jointAxisFromFace = jointAxisFromFace as never;
  store.state = withNode(withOpenPantin(store.state, pantin), jointNodeId("bench", "rod"));
  openJointEditForm(store, jointNodeId("bench", "rod"));
  return { store, jointAxisFromFace, fetchFaceFile };
}

const answered = async () => ({ origin: [0.01, 0, 0.0205], axis: [-1, 0, 0] });

describe("axis pick mode", () => {
  it("starts from the form of a stored joint and waits for a click", () => {
    const { store } = axisStore(answered);
    startAxisPick(store);
    expect(isPickingAxis(store.state)).toBe(true);
  });

  it("asks the core on a pick and fills the fields, saving nothing", async () => {
    const { store, jointAxisFromFace } = axisStore(answered);
    startAxisPick(store);
    await receiveViewportPick(store, click("block"));
    expect(jointAxisFromFace).toHaveBeenCalledWith("bench", "rod", {
      bodyId: "block",
      faceIndex: 0,
      hitPoint: [0, 0, 0.1],
    });
    expect(store.state.jointForm?.values).toMatchObject({
      "origin.x": "10",
      "origin.y": "0",
      "origin.z": "20.5",
      "axis.x": "-1",
      "axis.y": "0",
      "axis.z": "0",
    });
    expect(store.state.axisPick).toMatchObject({ waiting: false });
    expect(store.state.openPantin?.document.joints[0]?.axis).toEqual([0, 0, 1]);
  });

  it("shows the core's refusal and keeps the fields", async () => {
    const { store } = axisStore(async () => {
      throw new PantinApiError("api", "No face file for this body.", "invalid_request", 400);
    });
    const before = store.state.jointForm?.values;
    startAxisPick(store);
    await receiveViewportPick(store, click("block"));
    expect(store.state.jointForm?.values).toEqual(before);
    expect(store.state.message?.detail).toContain("No face file");
    expect(isPickingAxis(store.state)).toBe(true);
  });

  it("does nothing on a click in empty space", async () => {
    const { store, jointAxisFromFace } = axisStore(answered);
    startAxisPick(store);
    await receiveViewportPick(store, null);
    expect(jointAxisFromFace).not.toHaveBeenCalled();
    expect(isPickingAxis(store.state)).toBe(true);
  });
});

describe("axis pick mode ends", () => {
  it("a second press cancels the pick", () => {
    const { store } = axisStore(answered);
    startAxisPick(store);
    startAxisPick(store);
    expect(store.state.axisPick).toBeNull();
  });

  it("ends on Escape, on closing the form and on another selection", () => {
    const { store } = axisStore(answered);
    startAxisPick(store);
    turnToolOff(store);
    expect(store.state.axisPick).toBeNull();
    startAxisPick(store);
    cancelJointForm(store);
    expect(store.state.axisPick).toBeNull();
    openJointEditForm(store, jointNodeId("bench", "rod"));
    startAxisPick(store);
    store.update(withNode(store.state, assemblyNodeId("bench", "block")));
    expect(store.state.axisPick).toBeNull();
  });
});

describe("axis pick mode exclusivity", () => {
  it("is exclusive with the alignment and the gizmo", () => {
    const { store } = axisStore(answered);
    startAxisPick(store);
    toggleGizmo(store, "move");
    expect(store.state.axisPick).toBeNull();
    openJointEditForm(store, jointNodeId("bench", "rod"));
    startAxisPick(store);
    expect(store.state.alignment).toBeNull();
    store.state = withNode(store.state, assemblyNodeId("bench", "block"));
    toggleAlignment(store);
    expect(store.state.axisPick).toBeNull();
  });
});
