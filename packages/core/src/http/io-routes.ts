import {
  CreateIoChannelsRequestSchema,
  CreateIoModuleRequestSchema,
  UpdateIoChannelRequestSchema,
  UpdateIoModuleRequestSchema,
} from "@pantin/protocol";
import { type Parser, parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import {
  moduleKeyOf,
  pantinIdOf,
  type Route,
  type RouteContext,
  tagNameOf,
} from "./route-context.ts";

// The I/O mapping routes (ADR 0049 point 4). Every answer is the whole
// IoMappingResponse, so the client never has to merge a partial one.

const IO = ["pantins", ":pantinId", "io"];
const MODULE = [...IO, "modules", ":moduleKey"];
const CHANNEL = [...IO, "channels", ":tagName"];

async function bodyOf<Output>(
  context: RouteContext,
  schema: Parser<Output>,
  what: string,
): Promise<Output> {
  return parseWithSchema(schema, await readJsonBody(context.request), what);
}

export const IO_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: IO,
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.readIo(pantinIdOf(context))),
  },
  {
    method: "POST",
    pattern: [...IO, "modules"],
    handle: async (context) => {
      const request = await bodyOf(context, CreateIoModuleRequestSchema, "The module");
      const answer = await context.service.createIoModule(pantinIdOf(context), request);
      sendJson(context.response, 201, answer);
    },
  },
  {
    method: "PATCH",
    pattern: MODULE,
    handle: async (context) => {
      const request = await bodyOf(context, UpdateIoModuleRequestSchema, "The module");
      const answer = await context.service.updateIoModule(
        pantinIdOf(context),
        moduleKeyOf(context),
        request,
      );
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "DELETE",
    pattern: MODULE,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.deleteIoModule(pantinIdOf(context), moduleKeyOf(context)),
      ),
  },
  {
    method: "POST",
    pattern: [...MODULE, "channels"],
    handle: async (context) => {
      const request = await bodyOf(context, CreateIoChannelsRequestSchema, "The channels");
      const answer = await context.service.createIoChannels(
        pantinIdOf(context),
        moduleKeyOf(context),
        request,
      );
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "PATCH",
    pattern: CHANNEL,
    handle: async (context) => {
      const request = await bodyOf(context, UpdateIoChannelRequestSchema, "The channel");
      const answer = await context.service.updateIoChannel(
        pantinIdOf(context),
        tagNameOf(context),
        request,
      );
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "DELETE",
    pattern: CHANNEL,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.deleteIoChannel(pantinIdOf(context), tagNameOf(context)),
      ),
  },
];
