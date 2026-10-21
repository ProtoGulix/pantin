import { CopyExampleRequestSchema, PantinIdSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import type { Route } from "./route-context.ts";

// Example Pantins (ADR 0062); the contract is in protocol/src/examples.ts.
export const EXAMPLE_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["examples"],
    handle: async ({ service, response }) =>
      sendJson(response, 200, { examples: await service.listExamples() }),
  },
  {
    method: "POST",
    pattern: ["examples", ":exampleId", "copy"],
    handle: async ({ service, request, response, parameters }) => {
      const exampleId = parseWithSchema(
        PantinIdSchema,
        parameters.exampleId,
        "The example id in the URL",
      );
      const body = await readJsonBody(request);
      const { name } = parseWithSchema(CopyExampleRequestSchema, body, "The copy request");
      sendJson(response, 201, await service.copyExample(exampleId, name));
    },
  },
];
