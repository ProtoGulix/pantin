import type { Body, PantinResponse, PantinSummary } from "@pantin/protocol";

// Sample data shared by the unit tests of the display logic.

export const railBody: Body = {
  id: "rail",
  name: "Linear rail",
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
): PantinResponse {
  return { id, unsavedChanges, document: { schema_version: 2, name: "Press", bodies, joints: [] } };
}

export const pantinSummaries: PantinSummary[] = [
  { id: "press", name: "Press", bodyCount: 1 },
  { id: "robot", name: "Robot", bodyCount: 4 },
];
