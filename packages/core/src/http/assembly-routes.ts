import {
  MoveBodyRequestSchema,
  RenameKeyRequestSchema,
  RenameRequestSchema,
  RenameTagKeyRequestSchema,
} from "@pantin/protocol";
import { suggestedKey } from "../domain/ids.ts";
import { formatIssues, type Parser, parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { assemblyKeyOf, bodyIdOf, jointIdOf, pantinIdOf, type Route } from "./route-context.ts";

// Assembly and key routes (ADR 0019); the contract is in assembly-api.ts.

// A key that breaks the pattern is refused with a valid key close to the
// typed one (ADR 0019 point 8): "Verin.Pince" gets "verin-pince".
function parseKeyRequest<Output>(
  schema: Parser<Output>,
  body: unknown,
  field: "key" | "tagKey",
  what: string,
): Output {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  const typed: unknown =
    typeof body === "object" && body !== null ? Reflect.get(body, field) : undefined;
  const hint = typeof typed === "string" ? ` Try "${suggestedKey(typed)}".` : "";
  throw new ApiError("invalid_request", `${what}: ${formatIssues(parsed.error.issues)}.${hint}`);
}

const ASSEMBLY = ["pantins", ":pantinId", "assemblies", ":assemblyKey"];

export const ASSEMBLY_ROUTES: readonly Route[] = [
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "assemblies"],
    handle: async (context) => {
      const { name } = parseWithSchema(
        RenameRequestSchema,
        await readJsonBody(context.request),
        "The new assembly",
      );
      const pantin = await context.service.createAssembly(pantinIdOf(context), name);
      sendJson(context.response, 201, pantin);
    },
  },
  {
    method: "PATCH",
    pattern: ASSEMBLY,
    handle: async (context) => {
      const { name } = parseWithSchema(
        RenameRequestSchema,
        await readJsonBody(context.request),
        "The rename request",
      );
      const key = assemblyKeyOf(context);
      sendJson(
        context.response,
        200,
        await context.service.renameAssembly(pantinIdOf(context), key, name),
      );
    },
  },
  {
    method: "DELETE",
    pattern: ASSEMBLY,
    handle: async (context) => {
      const key = assemblyKeyOf(context);
      sendJson(
        context.response,
        200,
        await context.service.deleteAssembly(pantinIdOf(context), key),
      );
    },
  },
  {
    method: "PUT",
    pattern: [...ASSEMBLY, "key"],
    handle: async (context) => {
      const { key } = parseKeyRequest(
        RenameKeyRequestSchema,
        await readJsonBody(context.request),
        "key",
        "The new assembly key",
      );
      const pantinId = pantinIdOf(context);
      const answer = await context.service.renameAssemblyKey(pantinId, assemblyKeyOf(context), key);
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "joints", ":jointId", "tag-key"],
    handle: async (context) => {
      const { tagKey } = parseKeyRequest(
        RenameTagKeyRequestSchema,
        await readJsonBody(context.request),
        "tagKey",
        "The new tag key",
      );
      const pantinId = pantinIdOf(context);
      const answer = await context.service.renameTagKey(pantinId, jointIdOf(context), tagKey);
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "bodies", ":bodyId", "assembly"],
    handle: async (context) => {
      const { assembly } = parseWithSchema(
        MoveBodyRequestSchema,
        await readJsonBody(context.request),
        "The move request",
      );
      const pantinId = pantinIdOf(context);
      const answer = await context.service.moveBody(pantinId, bodyIdOf(context), assembly);
      sendJson(context.response, 200, answer);
    },
  },
];
