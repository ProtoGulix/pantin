import {
  API_PREFIX,
  type ApiErrorCode,
  ApiErrorResponseSchema,
  type Body,
  BodyResponseSchema,
  CreatePantinRequestSchema,
  type ImportBodyQuery,
  ImportBodyQuerySchema,
  PANTIN_MESHES_DIRECTORY_NAME,
  PantinListResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
  type PantinSummary,
  RenameRequestSchema,
} from "@pantin/protocol";

// The viewer's only door to the core (CLAUDE.md section 3.4). Every response
// is validated against the protocol schemas: the network is never trusted.

export type ApiFailureKind =
  // The core answered with a well-formed ApiErrorResponse.
  | "api"
  // The core could not be reached at all.
  | "network"
  // The core answered something that does not match the contract.
  | "invalid_response"
  // The viewer refused to send a request that breaks the contract.
  | "invalid_input";

export class PantinApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly code: ApiErrorCode | null;
  readonly status: number | null;

  constructor(
    kind: ApiFailureKind,
    message: string,
    code: ApiErrorCode | null,
    status: number | null,
  ) {
    super(message);
    this.name = "PantinApiError";
    this.kind = kind;
    this.code = code;
    this.status = status;
  }
}

// Structural view of a Zod schema, so the viewer depends on the contract
// package only and not on zod itself.
type SafeParseResult<Output> =
  | { success: true; data: Output }
  | { success: false; error: { message: string; issues: readonly { message: string }[] } };
interface Schema<Output> {
  safeParse(input: unknown): SafeParseResult<Output>;
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export interface PantinApiClient {
  listPantins(): Promise<PantinSummary[]>;
  createPantin(name: string): Promise<PantinResponse>;
  getPantin(pantinId: string): Promise<PantinResponse>;
  renamePantin(pantinId: string, name: string): Promise<PantinResponse>;
  savePantin(pantinId: string): Promise<PantinResponse>;
  importBody(pantinId: string, query: ImportBodyQuery, fileBytes: ArrayBuffer): Promise<Body>;
  renameBody(pantinId: string, bodyId: string, name: string): Promise<Body>;
  fetchMeshBytes(pantinId: string, meshPath: string): Promise<ArrayBuffer>;
}

function pantinUrl(pantinId: string, suffix = ""): string {
  return `${API_PREFIX}/pantins/${encodeURIComponent(pantinId)}${suffix}`;
}

function validInputOrThrow<Output>(schema: Schema<Output>, input: unknown): Output {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(" ");
    throw new PantinApiError("invalid_input", message, "invalid_request", null);
  }
  return result.data;
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

async function sendRequest(
  fetchFunction: FetchFunction,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchFunction(url, init);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new PantinApiError(
      "network",
      `Cannot reach the Pantin core (${reason}). Is it running on 127.0.0.1:4800?`,
      null,
      null,
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // The body is unusable either way; the caller reports it as a contract break.
    return undefined;
  }
}

async function failureFromResponse(response: Response): Promise<PantinApiError> {
  const parsed = ApiErrorResponseSchema.safeParse(await readJson(response));
  if (parsed.success) {
    const { code, message } = parsed.data.error;
    return new PantinApiError("api", message, code, response.status);
  }
  return new PantinApiError(
    "invalid_response",
    `The core answered HTTP ${response.status} without a valid error description.`,
    null,
    response.status,
  );
}

async function requestJson<Output>(
  fetchFunction: FetchFunction,
  url: string,
  init: RequestInit,
  schema: Schema<Output>,
): Promise<Output> {
  const response = await sendRequest(fetchFunction, url, init);
  if (!response.ok) {
    throw await failureFromResponse(response);
  }
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new PantinApiError(
      "invalid_response",
      `The core's answer to ${init.method ?? "GET"} ${url} does not match the protocol: ${parsed.error.message}`,
      null,
      response.status,
    );
  }
  return parsed.data;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  if (body === undefined) {
    return { method };
  }
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
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

type SendJson = <Output>(url: string, init: RequestInit, schema: Schema<Output>) => Promise<Output>;

type PantinRoutes = Pick<
  PantinApiClient,
  "listPantins" | "createPantin" | "getPantin" | "renamePantin" | "savePantin"
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
  };
}

type BodyRoutes = Pick<PantinApiClient, "importBody" | "renameBody" | "fetchMeshBytes">;

function bodyRoutes(send: SendJson, fetchFunction: FetchFunction): BodyRoutes {
  return {
    importBody: async (pantinId, query, fileBytes) => {
      const validQuery = validInputOrThrow(ImportBodyQuerySchema, query);
      const url = pantinUrl(pantinId, `/bodies?${importQueryString(validQuery)}`);
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: fileBytes,
      };
      return (await send(url, init, BodyResponseSchema)).body;
    },
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
  return { ...pantinRoutes(send), ...bodyRoutes(send, fetchFunction) };
}
