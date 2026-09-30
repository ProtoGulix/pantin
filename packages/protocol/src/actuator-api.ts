import { z } from "zod";
import { ActuatorSchema, CreateActuatorRequestSchema } from "./actuator.ts";

// Actuators (ADR 0028), under API_PREFIX:
//
//   POST   /api/pantins/:pantinId/actuators  CreateActuatorRequest -> 201 ActuatorResponse
//   PATCH  /api/pantins/:pantinId/actuators/:actuatorId  UpdateActuatorRequest -> ActuatorResponse
//          (every field but the id; the type may change; a new feed replaces
//          the previous one, none removes it)
//   DELETE /api/pantins/:pantinId/actuators/:actuatorId  -> PantinResponse
//
// An actuator has no tag and no fault of its own: a jammed joint is a fault
// of the joint (drive-api.ts).

export const ActuatorResponseSchema = z.object({ actuator: ActuatorSchema });
export type ActuatorResponse = z.infer<typeof ActuatorResponseSchema>;

// The whole actuator without its id, as for creation.
export const UpdateActuatorRequestSchema = CreateActuatorRequestSchema;
export type UpdateActuatorRequest = z.infer<typeof UpdateActuatorRequestSchema>;
