import { z } from "zod";
import { DisplayNameSchema, PantinIdSchema } from "./ids.ts";

// Example Pantins shipped beside the core (ADR 0062), under API_PREFIX.
//
//   GET  /api/examples                          -> ExampleListResponse
//        (empty when the core runs without --examples-dir; a folder that
//        fails the checks of ADR 0062 point 2 is left out)
//   POST /api/examples/:exampleId/copy  CopyExampleRequest
//        -> 201 PantinResponse (api.ts): a copy in the Pantins folder, open
//        like a created Pantin. 404 for an unknown or unlisted example, also
//        when examples are disabled; 400 for an id that fails PantinIdSchema.

export const ExampleSummarySchema = z.object({
  id: PantinIdSchema,
  name: DisplayNameSchema,
  bodyCount: z.number().int().nonnegative(),
});
export type ExampleSummary = z.infer<typeof ExampleSummarySchema>;

export const ExampleListResponseSchema = z.object({ examples: z.array(ExampleSummarySchema) });
export type ExampleListResponse = z.infer<typeof ExampleListResponseSchema>;

// Without a name the copy keeps the example's own name.
export const CopyExampleRequestSchema = z.object({ name: DisplayNameSchema.optional() });
export type CopyExampleRequest = z.infer<typeof CopyExampleRequestSchema>;
