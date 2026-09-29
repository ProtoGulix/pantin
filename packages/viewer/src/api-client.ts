import {
  API_PREFIX,
  type Body,
  BodyResponseSchema,
  CreatePantinRequestSchema,
  ImportBodiesResponseSchema,
  type ImportBodyQuery,
  ImportBodyQuerySchema,
  PANTIN_MESHES_DIRECTORY_NAME,
  PantinListResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
  type PantinSummary,
  RenameRequestSchema,
} from "@pantin/protocol";
import { type JointRoutes, jointRoutes } from "./api-joint-routes.ts";
import {
  type FetchFunction,
  failureFromResponse,
  jsonRequest,
  PantinApiError,
  pantinUrl,
  requestJson,
  type SendJson,
  sendRequest,
  validInputOrThrow,
} from "./api-transport.ts";

// The viewer's only door to the core (CLAUDE.md section 3.4). Every response
// is validated against the protocol schemas: the network is never trusted.

export interface PantinApiClient extends JointRoutes {
  listPantins(): Promise<PantinSummary[]>;
  createPantin(name: string): Promise<PantinResponse>;
  getPantin(pantinId: string): Promise<PantinResponse>;
  renamePantin(pantinId: string, name: string): Promise<PantinResponse>;
  savePantin(pantinId: string): Promise<PantinResponse>;
  // Throws away the unsaved edits: the core reloads pantin.json.
  discardPantin(pantinId: string): Promise<PantinResponse>;
  // One body for GLB and STL, one per assembly component for STEP (ADR 0009).
  importBodies(pantinId: string, query: ImportBodyQuery, fileBytes: ArrayBuffer): Promise<Body[]>;
  renameBody(pantinId: string, bodyId: string, name: string): Promise<Body>;
  // The whole Pantin comes back: the body is gone and unsavedChanges is set.
  deleteBody(pantinId: string, bodyId: string): Promise<PantinResponse>;
  fetchMeshBytes(pantinId: string, meshPath: string): Promise<ArrayBuffer>;
}

// A body's mesh path is "meshes/<file name>" relative to the Pantin folder;
// the API serves it as /meshes/:fileName. Anything else is refused rather than
// turned into an arbitrary URL.
export function meshFileNameFromPath(meshPath: string): string {
  const prefix = `${PANTIN_MESHES_DIRECTORY_NAME}/`;
  const fileName = meshPath.startsWith(prefix) ? meshPath.slice(prefix.length) : "";
  if (fileName === "" || fileName.includes("/") || fileName.includes("\\")) {
    throw new PantinApiError(
      "invalid_response",
      `Mesh path "${meshPath}" is not of the form "${prefix}<file name>".`,
      null,
      null,
    );
  }
  return fileName;
}

function importQueryString(query: ImportBodyQuery): string {
  const parameters = new URLSearchParams({ fileName: query.fileName });
  if (query.unit !== undefined) {
    parameters.set("unit", query.unit);
  }
  if (query.upAxis !== undefined) {
    parameters.set("upAxis", query.upAxis);
  }
  return parameters.toString();
}

type PantinRoutes = Pick<
  PantinApiClient,
  "listPantins" | "createPantin" | "getPantin" | "renamePantin" | "savePantin" | "discardPantin"
>;

function pantinRoutes(send: SendJson): PantinRoutes {
  return {
    listPantins: async () =>
      (await send(`${API_PREFIX}/pantins`, jsonRequest("GET"), PantinListResponseSchema)).pantins,
    createPantin: async (name) => {
      const request = validInputOrThrow(CreatePantinRequestSchema, { name });
      return send(`${API_PREFIX}/pantins`, jsonRequest("POST", request), PantinResponseSchema);
    },
    getPantin: (pantinId) => send(pantinUrl(pantinId), jsonRequest("GET"), PantinResponseSchema),
    renamePantin: async (pantinId, name) => {
      const request = validInputOrThrow(RenameRequestSchema, { name });
      return send(pantinUrl(pantinId), jsonRequest("PATCH", request), PantinResponseSchema);
    },
    savePantin: (pantinId) =>
      send(pantinUrl(pantinId, "/save"), jsonRequest("POST"), PantinResponseSchema),
    discardPantin: (pantinId) =>
      send(pantinUrl(pantinId, "/discard"), jsonRequest("POST"), PantinResponseSchema),
  };
}

type BodyRoutes = Pick<
  PantinApiClient,
  "importBodies" | "renameBody" | "deleteBody" | "fetchMeshBytes"
>;

function bodyRoutes(send: SendJson, fetchFunction: FetchFunction): BodyRoutes {
  return {
    importBodies: async (pantinId, query, fileBytes) => {
      const validQuery = validInputOrThrow(ImportBodyQuerySchema, query);
      const url = pantinUrl(pantinId, `/bodies?${importQueryString(validQuery)}`);
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: fileBytes,
      };
      return (await send(url, init, ImportBodiesResponseSchema)).bodies;
    },
    deleteBody: (pantinId, bodyId) =>
      send(
        pantinUrl(pantinId, `/bodies/${encodeURIComponent(bodyId)}`),
        jsonRequest("DELETE"),
        PantinResponseSchema,
      ),
    renameBody: async (pantinId, bodyId, name) => {
      const request = validInputOrThrow(RenameRequestSchema, { name });
      const url = pantinUrl(pantinId, `/bodies/${encodeURIComponent(bodyId)}`);
      return (await send(url, jsonRequest("PATCH", request), BodyResponseSchema)).body;
    },
    // Mesh files are raw bytes, not JSON: only the error answers are validated.
    fetchMeshBytes: async (pantinId, meshPath) => {
      const fileName = meshFileNameFromPath(meshPath);
      const url = pantinUrl(pantinId, `/meshes/${encodeURIComponent(fileName)}`);
      const response = await sendRequest(fetchFunction, url, { method: "GET" });
      if (!response.ok) {
        throw await failureFromResponse(response);
      }
      return response.arrayBuffer();
    },
  };
}

export function createPantinApiClient(fetchFunction: FetchFunction): PantinApiClient {
  const send: SendJson = (url, init, schema) => requestJson(fetchFunction, url, init, schema);
  return { ...pantinRoutes(send), ...bodyRoutes(send, fetchFunction), ...jointRoutes(send) };
}
