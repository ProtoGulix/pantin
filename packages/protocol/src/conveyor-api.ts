import { PresenceSensorFieldsSchema } from "@pantin/sensor-types/schemas";
import { z } from "zod";
import { DisplayNameSchema } from "./ids.ts";
import {
  AbsorberSchema,
  BeltSchema,
  EmitterSchema,
  frameFields,
  GuideSchema,
  PresenceSensorSchema,
} from "./pantin-conveyors.ts";

// Belts, guides, emitters, absorbers and presence sensors (ADR 0043 point 12),
// under API_PREFIX, each with the same three routes (`<kind>` is belts,
// guides, emitters, absorbers or presence-sensors; `<Item>` the matching name
// below):
//
//   POST   /api/pantins/:pantinId/<kind>  Create<Item>Request -> 201 <Item>Response
//   PATCH  /api/pantins/:pantinId/<kind>/:id  Create<Item>Request -> <Item>Response
//          (whole replacement, as for joints: every field but the id and the
//          tag key; the type of a presence sensor may change)
//   DELETE /api/pantins/:pantinId/<kind>/:id  -> PantinResponse
//
// The core derives the id from the name, and the tag key of an emitter or a
// presence sensor too, as for drives. Edits are unsaved changes. A body used
// as a frame, and a drum joint that is deleted or changes type, are refused
// with `conflict`; deleting an assembly deletes its objects (ADR 0037).
//
//   POST   /api/pantins/:pantinId/reset  -> PantinResponse
//          (the runtime goes back to the reference configuration: no product,
//          command, motion or fault. The document with its unsaved edits, the
//          clock and the step count stay; discard is the route that reloads)
//
// An emitter's spawn tag is written through the tag route (tag.ts).

export const CreateBeltRequestSchema = BeltSchema.omit({ id: true });
export type CreateBeltRequest = z.infer<typeof CreateBeltRequestSchema>;
export const BeltResponseSchema = z.object({ belt: BeltSchema });
export type BeltResponse = z.infer<typeof BeltResponseSchema>;

export const CreateGuideRequestSchema = GuideSchema.omit({ id: true });
export type CreateGuideRequest = z.infer<typeof CreateGuideRequestSchema>;
export const GuideResponseSchema = z.object({ guide: GuideSchema });
export type GuideResponse = z.infer<typeof GuideResponseSchema>;

export const CreateEmitterRequestSchema = EmitterSchema.omit({ id: true, tagKey: true });
export type CreateEmitterRequest = z.infer<typeof CreateEmitterRequestSchema>;
export const EmitterResponseSchema = z.object({ emitter: EmitterSchema });
export type EmitterResponse = z.infer<typeof EmitterResponseSchema>;

export const CreateAbsorberRequestSchema = AbsorberSchema.omit({ id: true });
export type CreateAbsorberRequest = z.infer<typeof CreateAbsorberRequestSchema>;
export const AbsorberResponseSchema = z.object({ absorber: AbsorberSchema });
export type AbsorberResponse = z.infer<typeof AbsorberResponseSchema>;

// An intersection with the type's fields, so it is built, not omitted.
export const CreatePresenceSensorRequestSchema = z.intersection(
  z.object({ name: DisplayNameSchema, ...frameFields }),
  PresenceSensorFieldsSchema,
);
export type CreatePresenceSensorRequest = z.infer<typeof CreatePresenceSensorRequestSchema>;
export const PresenceSensorResponseSchema = z.object({ presenceSensor: PresenceSensorSchema });
export type PresenceSensorResponse = z.infer<typeof PresenceSensorResponseSchema>;
