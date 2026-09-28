import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BodyIdSchema,
  CreatePantinRequestSchema,
  ImportBodyQuerySchema,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinId,
  PantinIdSchema,
  RenameRequestSchema,
} from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import type { PantinService } from "../service/pantin-service.ts";
import { readBodyBytes, readJsonBody, requireContentType } from "./request-reading.ts";
import { sendJson } from "./responses.ts";

type RouteContext = {
  service: PantinService;
  maxImportBytes: number;
  request: IncomingMessage;
  response: ServerResponse;
  parameters: Record<string, string>;
  query: URLSearchParams;
};

type Route = {
  method: string;
  pattern: readonly string[];
  handle: (context: RouteContext) => Promise<void>;
};

const MESH_CONTENT_TYPES: Readonly<Record<string, string>> = {
  glb: "model/gltf-binary",
  stl: "model/stl",
};

function pantinIdOf(context: RouteContext): PantinId {
  return parseWithSchema(PantinIdSchema, context.parameters.pantinId, "The Pantin id in the URL");
}

// A mesh file name is "<bodyId>.glb" or "<bodyId>.stl": nothing else can name a file.
function meshPathOf(context: RouteContext): { meshPath: string; contentType: string } {
  const fileName = context.parameters.fileName ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const extension = dotIndex === -1 ? "" : fileName.slice(dotIndex + 1);
  parseWithSchema(BodyIdSchema, stem, "The mesh file name in the URL");
  const contentType = Object.hasOwn(MESH_CONTENT_TYPES, extension)
    ? MESH_CONTENT_TYPES[extension]
    : undefined;
  if (contentType === undefined) {
    throw new ApiError("invalid_request", `Mesh file "${fileName}" must end in .glb or .stl.`);
  }
  return { meshPath: `${PANTIN_MESHES_DIRECTORY_NAME}/${stem}.${extension}`, contentType };
}

async function readRenameRequest(context: RouteContext): Promise<string> {
  const body = await readJsonBody(context.request);
  return parseWithSchema(RenameRequestSchema, body, "The rename request").name;
}

async function importBody(context: RouteContext): Promise<void> {
  const pantinId = pantinIdOf(context);
  const query = parseWithSchema(
    ImportBodyQuerySchema,
    Object.fromEntries(context.query),
    "The import query",
  );
  requireContentType(context.request, "application/octet-stream");
  const bytes = await readBodyBytes(context.request, context.maxImportBytes);
  const bodies = await context.service.importBodies(pantinId, query, bytes);
  sendJson(context.response, 201, { bodies });
}

async function sendMesh(context: RouteContext): Promise<void> {
  const pantinId = pantinIdOf(context);
  const { meshPath, contentType } = meshPathOf(context);
  const file = await context.service.openBodyMesh(pantinId, meshPath);
  context.response.writeHead(200, {
    "content-type": contentType,
    "content-length": file.sizeInBytes,
  });
  file.stream.on("error", (error) => context.response.destroy(error));
  file.stream.pipe(context.response);
}

export const ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins"],
    handle: async ({ service, response }) =>
      sendJson(response, 200, { pantins: await service.listPantins() }),
  },
  {
    method: "POST",
    pattern: ["pantins"],
    handle: async ({ service, request, response }) => {
      const body = await readJsonBody(request);
      const { name } = parseWithSchema(CreatePantinRequestSchema, body, "The create request");
      sendJson(response, 201, await service.createPantin(name));
    },
  },
  {
    method: "GET",
    pattern: ["pantins", ":pantinId"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.getPantin(pantinIdOf(context))),
  },
  {
    method: "PATCH",
    pattern: ["pantins", ":pantinId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const name = await readRenameRequest(context);
      sendJson(context.response, 200, await context.service.renamePantin(pantinId, name));
    },
  },
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "save"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.savePantin(pantinIdOf(context))),
  },
  { method: "POST", pattern: ["pantins", ":pantinId", "bodies"], handle: importBody },
  {
    method: "PATCH",
    pattern: ["pantins", ":pantinId", "bodies", ":bodyId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const bodyId = parseWithSchema(
        BodyIdSchema,
        context.parameters.bodyId,
        "The body id in the URL",
      );
      const name = await readRenameRequest(context);
      sendJson(context.response, 200, {
        body: await context.service.renameBody(pantinId, bodyId, name),
      });
    },
  },
  { method: "GET", pattern: ["pantins", ":pantinId", "meshes", ":fileName"], handle: sendMesh },
];

export function methodNotAllowed(method: string, allowedMethods: string[]): ApiError {
  return new ApiError(
    "invalid_request",
    `Method ${method} is not allowed here. Use ${allowedMethods.join(" or ")}.`,
    405,
  );
}
