import {
  CreateIoChannelsRequestSchema,
  CreateIoModuleRequestSchema,
  type IoMappingResponse,
  UpdateIoChannelRequestSchema,
  UpdateIoModuleRequestSchema,
} from "@pantin/protocol";
import { renderGvl } from "../domain/gvl.ts";
import { renderIoCsv } from "../domain/io-csv.ts";
import { describeIoProblem } from "../domain/io-problem-text.ts";
import { type Parser, parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson, sendTextDownload } from "./responses.ts";
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
const CHANNEL = [...MODULE, "channels", ":tagName"];

async function bodyOf<Output>(
  context: RouteContext,
  schema: Parser<Output>,
  what: string,
): Promise<Output> {
  return parseWithSchema(schema, await readJsonBody(context.request), what);
}

// The GVL or the CSV of a mapping that is not valid would hide the very
// problems the user has to fix, so it is refused with them (ADR 0049 amendments).
function refusalOf(answer: IoMappingResponse, what: string): ApiError {
  if (answer.status === "missing") {
    return new ApiError("conflict", "This Pantin has no io.json yet: create the mapping first.");
  }
  const problems = answer.problems.map(describeIoProblem).join("; ");
  return new ApiError(
    "conflict",
    `The mapping is invalid, so no ${what} is generated: ${problems}`,
  );
}

export const IO_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: IO,
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.readIo(pantinIdOf(context))),
  },
  {
    method: "GET",
    pattern: [...IO, "gvl"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const answer = await context.service.readIo(pantinId);
      if (answer.status !== "valid") {
        throw refusalOf(answer, "GVL");
      }
      sendTextDownload(context.response, renderGvl(answer.modules), `${pantinId}.gvl`);
    },
  },
  {
    method: "GET",
    pattern: [...IO, "csv"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const answer = await context.service.readIo(pantinId);
      if (answer.status !== "valid") {
        throw refusalOf(answer, "CSV");
      }
      const csv = renderIoCsv(answer.modules);
      sendTextDownload(context.response, csv, `${pantinId}-io.csv`, "text/csv");
    },
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
        moduleKeyOf(context),
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
        await context.service.deleteIoChannel(
          pantinIdOf(context),
          moduleKeyOf(context),
          tagNameOf(context),
        ),
      ),
  },
];
