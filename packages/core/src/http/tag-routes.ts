import { ConsoleQuerySchema, WriteTagRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route, tagNameOf } from "./route-context.ts";

// Tag routes (ADR 0012): the REST face of what the tag bus carries, and the
// console read (ADR 0031), which the tag bus carries too. A REST write is a
// client write: it forces its tag until a release (ADR 0045 point 5).
// The I/O mapping routes, which map these tags, are in io-routes.ts.
export const TAG_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "tags"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.listTags(pantinIdOf(context))),
  },
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "signals"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.listSignals(pantinIdOf(context))),
  },
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "console"],
    handle: async (context) => {
      const { after } = parseWithSchema(
        ConsoleQuerySchema,
        Object.fromEntries(context.query),
        "The console query",
      );
      sendJson(
        context.response,
        200,
        await context.service.readConsole(pantinIdOf(context), after ?? 0),
      );
    },
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "tags", ":tagName"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const tagName = tagNameOf(context);
      const body = await readJsonBody(context.request);
      const { value } = parseWithSchema(WriteTagRequestSchema, body, "The tag value");
      const { tag } = await context.service.writeTag(pantinId, tagName, value, "client");
      sendJson(context.response, 200, { tag });
    },
  },
  {
    method: "DELETE",
    pattern: ["pantins", ":pantinId", "tags", ":tagName", "force"],
    handle: async (context) => {
      const tag = await context.service.releaseTag(pantinIdOf(context), tagNameOf(context));
      sendJson(context.response, 200, { tag });
    },
  },
  {
    method: "DELETE",
    pattern: ["pantins", ":pantinId", "forces"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.releaseAllTags(pantinIdOf(context))),
  },
];
