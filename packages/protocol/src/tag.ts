import { z } from "zod";

// Tags seen from the PLC (CLAUDE.md section 5.6, ADR 0012). In this phase the
// core derives them from the joints: "<jointId>.setpoint" (command) and
// "<jointId>.position" (feedback), in SI units.
//
//   GET /api/pantins/:pantinId/tags                      -> TagListResponse
//   PUT /api/pantins/:pantinId/tags/:tagName  WriteTagRequest -> TagResponse
//
// A written command takes effect at the next simulation step (1/120 s of
// simulated time); feedback tags cannot be written.

export const TagTypeSchema = z.enum(["bit", "integer", "float"]);
export type TagType = z.infer<typeof TagTypeSchema>;

// Seen from the PLC: it writes commands and reads feedback.
export const TagDirectionSchema = z.enum(["command", "feedback"]);
export type TagDirection = z.infer<typeof TagDirectionSchema>;

// "<owner id>.<member>": the owner is a safe id (no dot), the member a
// lowercase word, so a tag name never contains a slash.
export const TagNameSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[a-z][a-z_]{0,31}$/,
    'A tag name is "<id>.<member>", for example "stroke.setpoint".',
  );

// Every value is a number: a bit will be 0 or 1, as in a PLC's process
// image (not enforced yet: only float tags exist, ADR 0012 point 2).
const TagValueSchema = z.number().refine(Number.isFinite, "A tag value must be a finite number.");

export const TagSchema = z.object({
  name: TagNameSchema,
  type: TagTypeSchema,
  direction: TagDirectionSchema,
  value: TagValueSchema,
});
export type Tag = z.infer<typeof TagSchema>;

export const TagListResponseSchema = z.object({
  // Simulation steps run since the Pantin was opened.
  stepCount: z.number().int().nonnegative(),
  tags: z.array(TagSchema),
});
export type TagListResponse = z.infer<typeof TagListResponseSchema>;

export const WriteTagRequestSchema = z.object({ value: TagValueSchema });
export type WriteTagRequest = z.infer<typeof WriteTagRequestSchema>;

export const TagResponseSchema = z.object({ tag: TagSchema });
export type TagResponse = z.infer<typeof TagResponseSchema>;
