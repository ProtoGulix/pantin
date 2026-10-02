import type { AlignRequest, CreateJointRequest, FaceFile, PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { bodyOf, documentOf } from "../diagram/diagram-fixtures.ts";
import { withNode } from "../test-fixtures.ts";
import { assemblyNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import {
  applyAlignment,
  receiveAlignmentPick,
  setAlignmentFixedJoint,
  toggleAlignment,
} from "./alignment-actions.ts";
import { testStore } from "./controller-test-helpers.ts";
import { toggleGizmo } from "./gizmo-actions.ts";

// Aligning from the viewer (ADR 0035): the session, the picks checked at once,
// then one request to the core, and the fixed joint when asked.

const PANTIN: PantinResponse = {
  id: "bench",
  unsavedChanges: false,
  document: documentOf({ assemblies: ["a", "block"], bodies: [bodyOf("block", "block")] }),
};

const FACE_FILE: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [{ mesh: 0, primitive: 0, ranges: [[0, 2, 0]] }],
  faces: [{ kind: "plane", point: [0, 0, 0], normal: [0, 0, -1] }],
};

function click(bodyId: string): ViewportPick {
  return {
    bodyId,
    meshIndex: 0,
    pointers: ["/meshes/0/primitives/0"],
    triangle: 1,
    point: [0, 0, 0.1],
    normal: [0, 0, 1],
  };
}

function alignmentStore(targetDisplaced = false, jointFails = false) {
  const fetchFaceFile = vi.fn(async (_pantinId: string, meshPath: string) =>
    meshPath === "meshes/block.glb" ? FACE_FILE : null,
  );
  const aligned: AlignRequest[] = [];
  const joints: CreateJointRequest[] = [];
  const store = testStore({
    getPantin: async () => PANTIN,
    listPantins: async () => [],
    fetchFaceFile,
    alignAssembly: async (_pantinId, _key, request) => {
      aligned.push(request);
      return {
        placement: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
        anchor: { kind: "world" },
        targetDisplaced,
      };
    },
    createJoint: async (_pantinId, request) => {
      if (jointFails) {
        throw new Error("joint refused");
      }
      joints.push(request);
      return { ...request, id: "link", tagKey: "link" };
    },
  });
  store.requestedPantinId = PANTIN.id;
  store.state = withNode(withOpenPantin(store.state, PANTIN), assemblyNodeId("bench", "block"));
  return { store, fetchFaceFile, aligned, joints };
}

async function pickBoth(store: ReturnType<typeof alignmentStore>["store"]) {
  toggleAlignment(store);
  await receiveAlignmentPick(store, click("block"));
  await receiveAlignmentPick(store, click("frame"));
}

describe("alignment session in the viewer", () => {
  it("starts on the selected assembly with the gizmo off, and stops on the same command", () => {
    const { store } = alignmentStore();
    store.state = { ...store.state, gizmoMode: "move" };
    toggleAlignment(store);
    expect(store.state).toMatchObject({ gizmoMode: null, alignment: { assemblyKey: "block" } });
    toggleAlignment(store);
    expect(store.state.alignment).toBeNull();
  });

  it("takes a face of the face file, then the plane of a triangle where there is none", async () => {
    const { store, fetchFaceFile } = alignmentStore();
    await pickBoth(store);
    expect(store.state.alignment?.picks.map((pick) => pick?.pick.kind)).toEqual(["face", "plane"]);
    await receiveAlignmentPick(store, click("block"));
    expect(fetchFaceFile).toHaveBeenCalledTimes(2);
    expect(store.state.message?.key).toBe("alignment.refusal.allPicked");
  });

  it("downloads a face file again after a failure", async () => {
    const { store, fetchFaceFile } = alignmentStore();
    fetchFaceFile.mockRejectedValueOnce(new Error("network down"));
    toggleAlignment(store);
    await receiveAlignmentPick(store, click("block"));
    expect(store.state.alignment?.picks[0]).toBeNull();
    await receiveAlignmentPick(store, click("block"));
    expect(store.state.alignment?.picks[0]?.faceKind).toBe("plane");
  });

  it("is dropped when another Pantin opens, and ends when the gizmo starts", () => {
    const { store } = alignmentStore();
    toggleAlignment(store);
    store.state = withOpenPantin(store.state, { ...PANTIN, id: "other" });
    expect(store.state.alignment).toBeNull();
    store.state = withNode(withOpenPantin(store.state, PANTIN), assemblyNodeId("bench", "block"));
    toggleAlignment(store);
    toggleGizmo(store, "move");
    expect(store.state).toMatchObject({ gizmoMode: "move", alignment: null });
  });

  it("says why a click is refused", async () => {
    const { store } = alignmentStore();
    toggleAlignment(store);
    await receiveAlignmentPick(store, click("frame"));
    expect(store.state.message?.key).toBe("alignment.refusal.mustBeMoving");
    expect(store.state.alignment?.picks).toEqual([null, null]);
  });
});

describe("applying an alignment", () => {
  it("sends the picks in SI units, then starts the picks over", async () => {
    const { store, aligned, joints } = alignmentStore();
    await pickBoth(store);
    await applyAlignment(store);
    expect(aligned).toMatchObject([
      { kind: "plane_on_plane", flip: false, offset: 0, rotation: 0 },
    ]);
    expect(joints).toEqual([]);
    expect(store.state.alignment?.picks).toEqual([null, null]);
    expect(store.state.message?.key).toBe("alignment.done");
  });

  it("creates the fixed joint from the target to the moving body when asked", async () => {
    const { store, joints } = alignmentStore(true);
    await pickBoth(store);
    setAlignmentFixedJoint(store, true);
    await applyAlignment(store);
    expect(joints).toMatchObject([{ type: "fixed", parent: "frame", child: "block" }]);
    // Linked: the alignment holds wherever the target goes.
    expect(store.state.message?.key).toBe("alignment.done");
  });

  it("reads the Pantin again and says so when the joint fails after the alignment", async () => {
    const { store } = alignmentStore(false, true);
    let reads = 0;
    const getPantin = store.ports.api.getPantin;
    store.ports.api.getPantin = async (pantinId) => {
      reads += 1;
      return getPantin(pantinId);
    };
    await pickBoth(store);
    setAlignmentFixedJoint(store, true);
    await applyAlignment(store);
    expect(reads).toBe(1);
    expect(store.state.message).toMatchObject({
      key: "alignment.jointFailed",
      detail: "joint refused",
    });
  });

  it("warns when the target is displaced by a joint and nothing links them", async () => {
    const { store } = alignmentStore(true);
    await pickBoth(store);
    await applyAlignment(store);
    expect(store.state.message?.key).toBe("alignment.targetDisplaced");
  });
});
