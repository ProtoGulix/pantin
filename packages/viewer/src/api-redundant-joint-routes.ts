import {
  type RedundantJointsDeletionRequest,
  RedundantJointsDeletionRequestSchema,
  type RedundantJointsDeletionResponse,
  RedundantJointsDeletionResponseSchema,
  type RedundantJointsList,
  RedundantJointsListSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Redundant fixed joints of the API client (ADR 0060). The preview changes
// nothing; the deletion takes the previewed ids and the core keeps only those
// that are still redundant, reporting the others as skipped.

export interface RedundantJointRoutes {
  listRedundantJoints(pantinId: string): Promise<RedundantJointsList>;
  deleteRedundantJoints(
    pantinId: string,
    jointIds: readonly string[],
  ): Promise<RedundantJointsDeletionResponse>;
}

export function redundantJointRoutes(send: SendJson): RedundantJointRoutes {
  return {
    listRedundantJoints: (pantinId) =>
      send(pantinUrl(pantinId, "/redundant-joints"), jsonRequest("GET"), RedundantJointsListSchema),
    deleteRedundantJoints: async (pantinId, jointIds) => {
      const request: RedundantJointsDeletionRequest = validInputOrThrow(
        RedundantJointsDeletionRequestSchema,
        { jointIds },
      );
      return send(
        pantinUrl(pantinId, "/redundant-joints/delete"),
        jsonRequest("POST", request),
        RedundantJointsDeletionResponseSchema,
      );
    },
  };
}
