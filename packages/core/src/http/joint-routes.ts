import {
  CreateJointRequestSchema,
  SetJointPositionRequestSchema,
  UpdateJointRequestSchema,
} from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { jointIdOf, pantinIdOf, type Route } from "./route-context.ts";

// Joint and pose routes (ADR 0011).
export const JOINT_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "joints"],
    handle: async (context) =>
      sendJson(context.response, 200, {
        joints: await context.service.listJoints(pantinIdOf(context)),
      }),
  },
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "joints"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const body = await readJsonBody(context.request);
      const request = parseWithSchema(CreateJointRequestSchema, body, "The joint");
      const joint = await context.service.createJoint(pantinId, request);
      sendJson(context.response, 201, { joint });
    },
  },
  {
    method: "PATCH",
    pattern: ["pantins", ":pantinId", "joints", ":jointId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const jointId = jointIdOf(context);
      const body = await readJsonBody(context.request);
      const request = parseWithSchema(UpdateJointRequestSchema, body, "The joint");
      const joint = await context.service.updateJoint(pantinId, jointId, request);
      sendJson(context.response, 200, { joint });
    },
  },
  {
    method: "DELETE",
    pattern: ["pantins", ":pantinId", "joints", ":jointId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const jointId = jointIdOf(context);
      sendJson(context.response, 200, await context.service.deleteJoint(pantinId, jointId));
    },
  },
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "pose"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.getPose(pantinIdOf(context))),
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "joints", ":jointId", "position"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const jointId = jointIdOf(context);
      const body = await readJsonBody(context.request);
      const { position } = parseWithSchema(SetJointPositionRequestSchema, body, "The position");
      const pose = await context.service.setJointPosition(pantinId, jointId, position);
      sendJson(context.response, 200, pose);
    },
  },
];
