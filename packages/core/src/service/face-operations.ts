import type {
  AlignRequest,
  Body,
  JointAxisFromFaceRequest,
  JointAxisFromFaceResponse,
  PantinDocument,
  PantinId,
} from "@pantin/protocol";
import { jointAxisOfFace } from "../domain/joint-axis-from-face.ts";
import { ApiError } from "../errors.ts";
import { alignAssembly, readBodyFaceFile } from "./alignment-operations.ts";
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import type { ServiceContext } from "./open-pantins.ts";

function findBody(pantinId: PantinId, document: PantinDocument, bodyId: string): Body {
  const body = document.bodies.find((candidate) => candidate.id === bodyId);
  if (body === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no body "${bodyId}".`);
  }
  return body;
}

// Joint axis from a picked face (ADR 0041): computed, never stored.
async function jointAxisFromFace(
  context: ServiceContext,
  pantinId: PantinId,
  jointId: string,
  request: JointAxisFromFaceRequest,
): Promise<JointAxisFromFaceResponse> {
  const openPantin = await loadSettledPantin(context, pantinId);
  const picked = findBody(pantinId, openPantin.document, request.bodyId);
  const faceFile = await readBodyFaceFile(context, pantinId, picked);
  // From here on, no await: the document and the positions stay those on screen.
  const { document, jointPositions } = openPantin;
  findBody(pantinId, document, request.bodyId);
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no joint "${jointId}".`);
  }
  return jointAxisOfFace(document, jointPositions, joint, faceFile, request);
}

// Operations that read picked faces: alignment (ADR 0035) and joint axis.
export function faceOperations(context: ServiceContext) {
  return {
    alignAssembly: (pantinId: PantinId, key: string, request: AlignRequest) =>
      alignAssembly(context, pantinId, key, request),
    jointAxisFromFace: (pantinId: PantinId, jointId: string, request: JointAxisFromFaceRequest) =>
      jointAxisFromFace(context, pantinId, jointId, request),
  };
}
