import type { AlignRequest, CreateJointRequest, FaceFile, PantinResponse } from "@pantin/protocol";
import { vi } from "vitest";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { bodyOf, documentOf } from "../diagram/diagram-fixtures.ts";
import { withNode } from "../test-fixtures.ts";
import { assemblyNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { receiveAlignmentPick, toggleAlignment } from "./alignment-actions.ts";
import { testStore } from "./controller-test-helpers.ts";

// A Pantin, a store and two picks to align "block" in the alignment tests.

export const PANTIN: PantinResponse = {
  id: "bench",
  unsavedChanges: false,
  changedOutside: [],
  document: documentOf({
    assemblies: ["a", "block"],
    bodies: [bodyOf("block", "block")],
  }),
};

const FACE_FILE: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [{ mesh: 0, primitive: 0, ranges: [[0, 2, 0]] }],
  faces: [{ kind: "plane", point: [0, 0, 0], normal: [0, 0, -1] }],
};

export function click(bodyId: string): ViewportPick {
  return {
    bodyId,
    meshIndex: 0,
    pointers: ["/meshes/0/primitives/0"],
    triangle: 1,
    point: [0, 0, 0.1],
    normal: [0, 0, 1],
  };
}

export function alignmentStore(targetDisplaced = false, jointFails = false) {
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

export async function pickBoth(store: ReturnType<typeof alignmentStore>["store"]) {
  toggleAlignment(store);
  await receiveAlignmentPick(store, click("block"));
  await receiveAlignmentPick(store, click("frame"));
}
