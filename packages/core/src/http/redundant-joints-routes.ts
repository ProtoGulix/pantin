import { RedundantJointsDeletionRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Redundant fixed joint routes (ADR 0060); the contract is in
// redundant-joints-api.ts. Outside `.../joints/` so that no joint id matches.

const REDUNDANT_JOINTS = ["pantins", ":pantinId", "redundant-joints"];

export const REDUNDANT_JOINT_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: REDUNDANT_JOINTS,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.listRedundantJoints(pantinIdOf(context)),
      ),
  },
  {
    method: "POST",
    pattern: [...REDUNDANT_JOINTS, "delete"],
    handle: async (context) => {
      const { jointIds } = parseWithSchema(
        RedundantJointsDeletionRequestSchema,
        await readJsonBody(context.request),
        "The redundant joint deletion request",
      );
      sendJson(
        context.response,
        200,
        await context.service.deleteRedundantJoints(pantinIdOf(context), jointIds),
      );
    },
  },
];
