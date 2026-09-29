import { WriteTagRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route, tagNameOf } from "./route-context.ts";

// Tag routes (ADR 0012): the REST face of what the tag bus will carry.
export const TAG_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "tags"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.listTags(pantinIdOf(context))),
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "tags", ":tagName"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const tagName = tagNameOf(context);
      const body = await readJsonBody(context.request);
      const { value } = parseWithSchema(WriteTagRequestSchema, body, "The tag value");
      const tag = await context.service.writeTag(pantinId, tagName, value);
      sendJson(context.response, 200, { tag });
    },
  },
];
