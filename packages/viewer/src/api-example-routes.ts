import {
  API_PREFIX,
  CopyExampleRequestSchema,
  ExampleListResponseSchema,
  type ExampleSummary,
  type PantinResponse,
  PantinResponseSchema,
} from "@pantin/protocol";
import { jsonRequest, type SendJson, validInputOrThrow } from "./api-transport.ts";

// The example routes of the API client (ADR 0062).

export interface ExampleRoutes {
  // Empty when the core runs without --examples-dir.
  listExamples(): Promise<ExampleSummary[]>;
  // A copy in the Pantins folder, already open; without a name it keeps the example's own.
  copyExample(exampleId: string, name?: string): Promise<PantinResponse>;
}

export function exampleRoutes(send: SendJson): ExampleRoutes {
  return {
    listExamples: async () =>
      (await send(`${API_PREFIX}/examples`, jsonRequest("GET"), ExampleListResponseSchema))
        .examples,
    copyExample: async (exampleId, name) => {
      const request = validInputOrThrow(CopyExampleRequestSchema, { name });
      return send(
        `${API_PREFIX}/examples/${encodeURIComponent(exampleId)}/copy`,
        jsonRequest("POST", request),
        PantinResponseSchema,
      );
    },
  };
}
