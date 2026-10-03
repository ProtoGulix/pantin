import {
  type AlignRequest,
  AlignRequestSchema,
  type AlignResponse,
  AlignResponseSchema,
  type AssemblyDeletion,
  type AssemblyDeletionResponse,
  AssemblyDeletionResponseSchema,
  AssemblyDeletionSchema,
  type AssemblyPlacementResponse,
  AssemblyPlacementResponseSchema,
  MoveBodyRequestSchema,
  type PantinResponse,
  PantinResponseSchema,
  type Placement,
  type RenamedTagsResponse,
  RenamedTagsResponseSchema,
  type RenameKeyRequest,
  RenameRequestSchema,
  type RenameTagKeyRequest,
  SetPlacementRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Assembly and key routes of the API client (ADR 0019). Keys change only
// here; the answers list the tags renamed with them. A key is sent as typed,
// not validated first: the core refuses a bad one with a valid key close to
// it (point 8), which a local check would hide.

export interface AssemblyRoutes {
  createAssembly(pantinId: string, name: string): Promise<PantinResponse>;
  // The display name only: never a tag.
  renameAssembly(pantinId: string, key: string, name: string): Promise<PantinResponse>;
  // Refused by the core while the assembly holds bodies.
  deleteAssembly(pantinId: string, key: string): Promise<PantinResponse>;
  // Dry run of the deletion with contents (ADR 0037): what would go, by name.
  // A 409 carries the core's message when another assembly's item blocks it.
  previewAssemblyDeletion(pantinId: string, key: string): Promise<AssemblyDeletion>;
  // `?contents=delete`: the assembly with its bodies, joints, drives,
  // actuators and sensors, in one step.
  deleteAssemblyWithContents(pantinId: string, key: string): Promise<AssemblyDeletionResponse>;
  renameAssemblyKey(pantinId: string, key: string, newKey: string): Promise<RenamedTagsResponse>;
  renameTagKey(pantinId: string, jointId: string, tagKey: string): Promise<RenamedTagsResponse>;
  moveBody(pantinId: string, bodyId: string, assembly: string): Promise<RenamedTagsResponse>;
  // In the frame of the assembly's anchor, SI (ADR 0033 point 8). The answer
  // is only the stored placement and its anchor: read the Pantin again.
  setAssemblyPlacement(
    pantinId: string,
    key: string,
    placement: Placement,
  ): Promise<AssemblyPlacementResponse>;
  // Moves the assembly by the motion its picks ask for (ADR 0035): the
  // answer is the stored placement; read the Pantin again.
  alignAssembly(pantinId: string, key: string, request: AlignRequest): Promise<AlignResponse>;
}

function assemblyUrl(pantinId: string, key: string, suffix = ""): string {
  return pantinUrl(pantinId, `/assemblies/${encodeURIComponent(key)}${suffix}`);
}

export function assemblyRoutes(send: SendJson): AssemblyRoutes {
  return {
    createAssembly: async (pantinId, name) => {
      const request = validInputOrThrow(RenameRequestSchema, { name });
      const url = pantinUrl(pantinId, "/assemblies");
      return send(url, jsonRequest("POST", request), PantinResponseSchema);
    },
    renameAssembly: async (pantinId, key, name) => {
      const request = validInputOrThrow(RenameRequestSchema, { name });
      return send(assemblyUrl(pantinId, key), jsonRequest("PATCH", request), PantinResponseSchema);
    },
    deleteAssembly: (pantinId, key) =>
      send(assemblyUrl(pantinId, key), jsonRequest("DELETE"), PantinResponseSchema),
    previewAssemblyDeletion: (pantinId, key) =>
      send(assemblyUrl(pantinId, key, "/deletion"), jsonRequest("GET"), AssemblyDeletionSchema),
    deleteAssemblyWithContents: (pantinId, key) =>
      send(
        `${assemblyUrl(pantinId, key)}?contents=delete`,
        jsonRequest("DELETE"),
        AssemblyDeletionResponseSchema,
      ),
    renameAssemblyKey: async (pantinId, key, newKey) => {
      const request: RenameKeyRequest = { key: newKey };
      const url = assemblyUrl(pantinId, key, "/key");
      return send(url, jsonRequest("PUT", request), RenamedTagsResponseSchema);
    },
    renameTagKey: async (pantinId, jointId, tagKey) => {
      const request: RenameTagKeyRequest = { tagKey };
      const url = pantinUrl(pantinId, `/joints/${encodeURIComponent(jointId)}/tag-key`);
      return send(url, jsonRequest("PUT", request), RenamedTagsResponseSchema);
    },
    moveBody: async (pantinId, bodyId, assembly) => {
      const request = validInputOrThrow(MoveBodyRequestSchema, { assembly });
      const url = pantinUrl(pantinId, `/bodies/${encodeURIComponent(bodyId)}/assembly`);
      return send(url, jsonRequest("PUT", request), RenamedTagsResponseSchema);
    },
    setAssemblyPlacement: async (pantinId, key, placement) => {
      const request = validInputOrThrow(SetPlacementRequestSchema, placement);
      const url = assemblyUrl(pantinId, key, "/placement");
      return send(url, jsonRequest("PUT", request), AssemblyPlacementResponseSchema);
    },
    alignAssembly: async (pantinId, key, request) => {
      const valid = validInputOrThrow(AlignRequestSchema, request);
      const url = assemblyUrl(pantinId, key, "/align");
      return send(url, jsonRequest("POST", valid), AlignResponseSchema);
    },
  };
}
