import {
  type Actuator,
  ActuatorResponseSchema,
  type CreateActuatorRequest,
  CreateActuatorRequestSchema,
  type PantinResponse,
  PantinResponseSchema,
  UpdateActuatorRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Actuator routes of the API client (ADR 0028 point 10).

export interface ActuatorRoutes {
  createActuator(pantinId: string, request: CreateActuatorRequest): Promise<Actuator>;
  // Replaces the whole actuator but its id; no feed removes the feed.
  updateActuator(
    pantinId: string,
    actuatorId: string,
    request: CreateActuatorRequest,
  ): Promise<Actuator>;
  deleteActuator(pantinId: string, actuatorId: string): Promise<PantinResponse>;
}

function actuatorUrl(pantinId: string, actuatorId: string): string {
  return pantinUrl(pantinId, `/actuators/${encodeURIComponent(actuatorId)}`);
}

export function actuatorRoutes(send: SendJson): ActuatorRoutes {
  return {
    createActuator: async (pantinId, request) => {
      const valid = validInputOrThrow(CreateActuatorRequestSchema, request);
      const url = pantinUrl(pantinId, "/actuators");
      return (await send(url, jsonRequest("POST", valid), ActuatorResponseSchema)).actuator;
    },
    updateActuator: async (pantinId, actuatorId, request) => {
      const valid = validInputOrThrow(UpdateActuatorRequestSchema, request);
      const url = actuatorUrl(pantinId, actuatorId);
      return (await send(url, jsonRequest("PATCH", valid), ActuatorResponseSchema)).actuator;
    },
    deleteActuator: (pantinId, actuatorId) =>
      send(actuatorUrl(pantinId, actuatorId), jsonRequest("DELETE"), PantinResponseSchema),
  };
}
