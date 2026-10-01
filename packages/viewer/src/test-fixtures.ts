import {
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinResponse,
  type PantinSummary,
} from "@pantin/protocol";
import { nodeSelection } from "./selection.ts";
import type { TreeViewState } from "./tree/tree-rows.ts";
import { withSelection } from "./tree/tree-state.ts";

// Sample data shared by the unit tests of the display logic.

/** Selects a tree node (or nothing), as a click on its row does. */
export function withNode<State extends TreeViewState>(state: State, nodeId: string | null): State {
  return withSelection(state, nodeSelection(nodeId));
}

export const railBody: Body = {
  id: "rail",
  name: "Linear rail",
  assembly: "main",
  source: {
    fileName: "3630.glb",
    format: "glb",
    unit: "m",
    upAxis: "z",
    nodes: [
      { name: "3630.00.0800N_0", path: [0, 0] },
      { name: "", path: [0, 1] },
    ],
  },
  mesh: "meshes/rail.glb",
};

export function stepBody(id: string, nodeName: string): Body {
  return {
    id,
    name: nodeName,
    assembly: "main",
    source: {
      fileName: "3630.step",
      format: "step",
      unit: "m",
      upAxis: "z",
      nodes: [{ name: nodeName, path: [0] }],
    },
    mesh: `meshes/${id}.glb`,
  };
}

export function pantinResponse(
  unsavedChanges: boolean,
  bodies: Body[] = [railBody],
  id = "press",
  joints: Joint[] = [],
): PantinResponse {
  return {
    id,
    unsavedChanges,
    document: {
      schema_version: PANTIN_SCHEMA_VERSION,
      name: "Press",
      assemblies: [{ key: "main", name: "main" }],
      bodies,
      joints,
      drives: [],
      actuators: [],
      sensors: [],
    },
  };
}

export const pantinSummaries: PantinSummary[] = [
  { id: "press", name: "Press", bodyCount: 1, modifiedAt: "2026-09-29T08:00:00.000Z" },
  { id: "robot", name: "Robot", bodyCount: 4, modifiedAt: "2026-09-30T12:00:00.000Z" },
];

const placement = {
  parent: "rail",
  child: "carriage",
  origin: [0.01, 0, 0.02] as [number, number, number],
  axis: [0, 0, 1] as [number, number, number],
};

// Metres and radians, as the core sends them.
export const hingeJoint: Joint = {
  ...placement,
  id: "hinge",
  tagKey: "hinge",
  name: "Hinge",
  type: "revolute",
  limits: [-Math.PI / 2, Math.PI / 2],
};

export const slideJoint: Joint = {
  ...placement,
  id: "slide",
  tagKey: "slide",
  name: "Slide",
  type: "prismatic",
  limits: [0, 0.1],
};

export const screwJoint: Joint = {
  ...placement,
  id: "screw",
  tagKey: "screw",
  name: "Screw",
  type: "helical",
  limits: [0, 0.05],
  pitch: 0.002,
};

export const spinJoint: Joint = {
  ...placement,
  id: "spin",
  tagKey: "spin",
  name: "Spin",
  type: "continuous",
};

export const weldJoint: Joint = {
  ...placement,
  id: "weld",
  tagKey: "weld",
  name: "Weld",
  type: "fixed",
};
