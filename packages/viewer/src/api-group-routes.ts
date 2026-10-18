import {
  type GroupBodiesRequest,
  GroupBodiesRequestSchema,
  type GroupBodiesResponse,
  GroupBodiesResponseSchema,
  type UngroupResponse,
  UngroupResponseSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Grouper and Dégrouper routes of the API client (ADR 0055 points 6 and 7).
// A refusal (409) carries the core's sentence, which is shown as it is.

export interface GroupRoutes {
  // One atomic command: the members are direct bodies and sub-assemblies of
  // the assembly `key`.
  groupBodies(
    pantinId: string,
    key: string,
    request: GroupBodiesRequest,
  ): Promise<GroupBodiesResponse>;
  // Dissolves the group `key` into its structure parent.
  ungroupAssembly(pantinId: string, key: string): Promise<UngroupResponse>;
}

function assemblyUrl(pantinId: string, key: string, suffix: string): string {
  return pantinUrl(pantinId, `/assemblies/${encodeURIComponent(key)}${suffix}`);
}

export function groupRoutes(send: SendJson): GroupRoutes {
  return {
    groupBodies: async (pantinId, key, request) => {
      const valid = validInputOrThrow(GroupBodiesRequestSchema, request);
      const url = assemblyUrl(pantinId, key, "/groups");
      return send(url, jsonRequest("POST", valid), GroupBodiesResponseSchema);
    },
    ungroupAssembly: (pantinId, key) =>
      send(assemblyUrl(pantinId, key, "/ungroup"), jsonRequest("POST"), UngroupResponseSchema),
  };
}
