import {
  ApplyIoVariablesRequestSchema,
  IO_VARIABLES_BODY_MAX_BYTES,
  SymbolPreviewQuerySchema,
} from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody, readXmlBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Importing the variables of a PLC program (ADR 0064 point 13). The preview takes the
// symbol file as its body, which is not JSON and has its own size limit; the apply takes
// the list the user checked, a larger JSON body than the other I/O edits.

const IO = ["pantins", ":pantinId", "io"];

export const IO_SYMBOL_ROUTES: readonly Route[] = [
  {
    method: "POST",
    pattern: [...IO, "symbols", "preview"],
    handle: async (context) => {
      const query = parseWithSchema(
        SymbolPreviewQuerySchema,
        Object.fromEntries(context.query),
        "The query",
      );
      const text = await readXmlBody(context.request);
      const preview = await context.service.previewIoSymbols(
        pantinIdOf(context),
        text,
        query.format,
      );
      sendJson(context.response, 200, preview);
    },
  },
  {
    method: "POST",
    pattern: [...IO, "variables"],
    handle: async (context) => {
      const body = await readJsonBody(context.request, IO_VARIABLES_BODY_MAX_BYTES);
      const request = parseWithSchema(ApplyIoVariablesRequestSchema, body, "The assignments");
      sendJson(
        context.response,
        200,
        await context.service.applyIoVariables(pantinIdOf(context), request),
      );
    },
  },
];
