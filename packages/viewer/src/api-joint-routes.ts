import {
  type AlignFramesResponse,
  AlignFramesResponseSchema,
  type CreateJointRequest,
  CreateJointRequestSchema,
  type Joint,
  type JointAxisFromFaceRequest,
  JointAxisFromFaceRequestSchema,
  type JointAxisFromFaceResponse,
  JointAxisFromFaceResponseSchema,
  JointListResponseSchema,
  JointResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
  type PoseResponse,
  PoseResponseSchema,
  SetJointPositionRequestSchema,
  type UpdateJointRequest,
  UpdateJointRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Joint and pose routes of the API client (ADR 0011).

export interface JointRoutes {
  listJoints(pantinId: string): Promise<Joint[]>;
  createJoint(pantinId: string, request: CreateJointRequest): Promise<Joint>;
  // The whole joint is replaced (same type); the id is kept, even on rename.
  updateJoint(pantinId: string, jointId: string, request: UpdateJointRequest): Promise<Joint>;
  // The whole Pantin comes back: the joint is gone and unsavedChanges is set.
  deleteJoint(pantinId: string, jointId: string): Promise<PantinResponse>;
  getPose(pantinId: string): Promise<PoseResponse>;
  // The axis a picked face gives, nothing stored (ADR 0041); the form shows it.
  jointAxisFromFace(
    pantinId: string,
    jointId: string,
    request: JointAxisFromFaceRequest,
  ): Promise<JointAxisFromFaceResponse>;
  // Turns the frames so the stored axis reads [0, 0, 1] (ADR 0056); no body.
  alignFrames(pantinId: string, jointId: string): Promise<AlignFramesResponse>;
  // The core clamps the position to the joint limits and answers the new pose.
  setJointPosition(pantinId: string, jointId: string, position: number): Promise<PoseResponse>;
}

function jointUrl(pantinId: string, jointId: string, suffix = ""): string {
  return pantinUrl(pantinId, `/joints/${encodeURIComponent(jointId)}${suffix}`);
}

export function jointRoutes(send: SendJson): JointRoutes {
  return {
    listJoints: async (pantinId) =>
      (await send(pantinUrl(pantinId, "/joints"), jsonRequest("GET"), JointListResponseSchema))
        .joints,
    createJoint: async (pantinId, request) => {
      const validRequest = validInputOrThrow(CreateJointRequestSchema, request);
      const url = pantinUrl(pantinId, "/joints");
      return (await send(url, jsonRequest("POST", validRequest), JointResponseSchema)).joint;
    },
    updateJoint: async (pantinId, jointId, request) => {
      const validRequest = validInputOrThrow(UpdateJointRequestSchema, request);
      const url = jointUrl(pantinId, jointId);
      return (await send(url, jsonRequest("PATCH", validRequest), JointResponseSchema)).joint;
    },
    deleteJoint: (pantinId, jointId) =>
      send(jointUrl(pantinId, jointId), jsonRequest("DELETE"), PantinResponseSchema),
    getPose: (pantinId) =>
      send(pantinUrl(pantinId, "/pose"), jsonRequest("GET"), PoseResponseSchema),
    setJointPosition: async (pantinId, jointId, position) => {
      const request = validInputOrThrow(SetJointPositionRequestSchema, { position });
      const url = jointUrl(pantinId, jointId, "/position");
      return send(url, jsonRequest("PUT", request), PoseResponseSchema);
    },
    alignFrames: (pantinId, jointId) =>
      send(
        jointUrl(pantinId, jointId, "/align-frames"),
        jsonRequest("POST"),
        AlignFramesResponseSchema,
      ),
    jointAxisFromFace: async (pantinId, jointId, request) => {
      const validRequest = validInputOrThrow(JointAxisFromFaceRequestSchema, request);
      const url = jointUrl(pantinId, jointId, "/axis-from-face");
      return send(url, jsonRequest("POST", validRequest), JointAxisFromFaceResponseSchema);
    },
  };
}
