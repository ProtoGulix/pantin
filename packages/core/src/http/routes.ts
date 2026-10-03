import {
  BodyIdSchema,
  CreatePantinRequestSchema,
  FACE_FILE_EXTENSION,
  ImportBodyQuerySchema,
  PANTIN_MESHES_DIRECTORY_NAME,
  RenameRequestSchema,
} from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { ACTUATOR_ROUTES } from "./actuator-routes.ts";
import { ASSEMBLY_ROUTES } from "./assembly-routes.ts";
import { CLOCK_ROUTES } from "./clock-routes.ts";
import { DRIVE_ROUTES } from "./drive-routes.ts";
import { JOINT_ROUTES } from "./joint-routes.ts";
import { ORPHAN_MESH_ROUTES } from "./orphan-mesh-routes.ts";
import { POSE_STREAM_ROUTES } from "./pose-stream-routes.ts";
import { readBodyBytes, readJsonBody, requireContentType } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { bodyIdOf, pantinIdOf, type Route, type RouteContext } from "./route-context.ts";
import { SENSOR_ROUTES } from "./sensor-routes.ts";
import { TAG_ROUTES } from "./tag-routes.ts";

const MESH_CONTENT_TYPES: Readonly<Record<string, string>> = {
  glb: "model/gltf-binary",
  stl: "model/stl",
};

// The face file extension without its leading dot, like "glb" and "stl".
const FACE_FILE_EXTENSION_NAME = FACE_FILE_EXTENSION.slice(1);

function stemAndExtension(fileName: string): { stem: string; extension: string } {
  if (fileName.endsWith(FACE_FILE_EXTENSION)) {
    return {
      stem: fileName.slice(0, -FACE_FILE_EXTENSION.length),
      extension: FACE_FILE_EXTENSION_NAME,
    };
  }
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1
    ? { stem: fileName, extension: "" }
    : { stem: fileName.slice(0, dotIndex), extension: fileName.slice(dotIndex + 1) };
}

// A file of the meshes folder is "<bodyId>.glb", "<bodyId>.stl" or the face
// file "<bodyId>.faces.json" (ADR 0035): nothing else can name a file.
function meshPathOf(context: RouteContext): { meshPath: string; contentType: string } {
  const fileName = context.parameters.fileName ?? "";
  const { stem, extension } = stemAndExtension(fileName);
  parseWithSchema(BodyIdSchema, stem, "The mesh file name in the URL");
  const contentType =
    extension === FACE_FILE_EXTENSION_NAME
      ? "application/json"
      : Object.hasOwn(MESH_CONTENT_TYPES, extension)
        ? MESH_CONTENT_TYPES[extension]
        : undefined;
  if (contentType === undefined) {
    throw new ApiError(
      "invalid_request",
      `Mesh file "${fileName}" must end in .glb, .stl or ${FACE_FILE_EXTENSION}.`,
    );
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
  const imported = await context.service.importBodies(pantinId, query, bytes);
  sendJson(context.response, 201, imported);
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

const PANTIN_ROUTES: readonly Route[] = [
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
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "discard"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.discardPantin(pantinIdOf(context))),
  },
  { method: "POST", pattern: ["pantins", ":pantinId", "bodies"], handle: importBody },
  {
    method: "PATCH",
    pattern: ["pantins", ":pantinId", "bodies", ":bodyId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const bodyId = bodyIdOf(context);
      const name = await readRenameRequest(context);
      sendJson(context.response, 200, {
        body: await context.service.renameBody(pantinId, bodyId, name),
      });
    },
  },
  {
    method: "DELETE",
    pattern: ["pantins", ":pantinId", "bodies", ":bodyId"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const bodyId = bodyIdOf(context);
      sendJson(context.response, 200, await context.service.deleteBody(pantinId, bodyId));
    },
  },
  { method: "GET", pattern: ["pantins", ":pantinId", "meshes", ":fileName"], handle: sendMesh },
];

export const ROUTES: readonly Route[] = [
  ...PANTIN_ROUTES,
  ...JOINT_ROUTES,
  ...ASSEMBLY_ROUTES,
  ...DRIVE_ROUTES,
  ...ACTUATOR_ROUTES,
  ...SENSOR_ROUTES,
  ...POSE_STREAM_ROUTES,
  ...CLOCK_ROUTES,
  ...ORPHAN_MESH_ROUTES,
  ...TAG_ROUTES,
];

export function methodNotAllowed(method: string, allowedMethods: string[]): ApiError {
  return new ApiError(
    "invalid_request",
    `Method ${method} is not allowed here. Use ${allowedMethods.join(" or ")}.`,
    405,
  );
}
