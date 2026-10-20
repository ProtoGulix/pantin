import { z } from "zod";
import { DisplayNameSchema } from "./ids.ts";
import { TagDirectionSchema, TagNameSchema, TagTypeSchema } from "./tag.ts";

// A signal is the static definition of a tag: what a PLC programmer reads,
// whatever protocol carries it (ADR 0064 points 1 and 2). The core derives the
// list from the document, in the order of the tags; nothing is stored.
//
//   GET /api/pantins/:pantinId/signals  -> SignalListResponse
//
// Values stay SI and are never scaled (ADR 0045 point 8): the unit says what
// a float is in. "none" is for bits and counts, "unknown" for a servo drive
// that feeds no actuator yet.

export const SIGNAL_UNITS = [
  "metre",
  "radian",
  "metre_per_second",
  "radian_per_second",
  "percent",
  "none",
  "unknown",
] as const;
export const SignalUnitSchema = z.enum(SIGNAL_UNITS);
export type SignalUnit = z.infer<typeof SignalUnitSchema>;

export const SIGNAL_OWNER_KINDS = [
  "joint",
  "drive",
  "sensor",
  "emitter",
  "presence_sensor",
] as const;
export const SignalOwnerKindSchema = z.enum(SIGNAL_OWNER_KINDS);
export type SignalOwnerKind = z.infer<typeof SignalOwnerKindSchema>;

export const SignalSchema = z.object({
  name: TagNameSchema,
  type: TagTypeSchema,
  direction: TagDirectionSchema,
  unit: SignalUnitSchema,
  owner: z.object({
    kind: SignalOwnerKindSchema,
    id: z.string().min(1),
    // The element's name, as the user typed it.
    name: DisplayNameSchema,
  }),
  member: z.string().min(1),
  // English text for people reading a list; clients show their own labels.
  description: z.string().min(1),
});
export type Signal = z.infer<typeof SignalSchema>;

export const SignalListResponseSchema = z.object({ signals: z.array(SignalSchema) });
export type SignalListResponse = z.infer<typeof SignalListResponseSchema>;
