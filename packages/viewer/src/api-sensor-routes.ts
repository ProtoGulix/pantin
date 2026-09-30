import {
  type CreateSensorRequest,
  CreateSensorRequestSchema,
  type PantinResponse,
  PantinResponseSchema,
  type RenamedTagsResponse,
  RenamedTagsResponseSchema,
  type Sensor,
  SensorResponseSchema,
  UpdateSensorRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Sensor routes of the API client (ADR 0023). Sensor tags are read with the
// other tags (api-drive-routes.ts).

export interface SensorRoutes {
  createSensor(pantinId: string, request: CreateSensorRequest): Promise<Sensor>;
  // Every field but the id and the tag key; the type may change.
  updateSensor(pantinId: string, sensorId: string, request: CreateSensorRequest): Promise<Sensor>;
  deleteSensor(pantinId: string, sensorId: string): Promise<PantinResponse>;
  renameSensorTagKey(
    pantinId: string,
    sensorId: string,
    tagKey: string,
  ): Promise<RenamedTagsResponse>;
}

function sensorUrl(pantinId: string, sensorId: string, suffix = ""): string {
  return pantinUrl(pantinId, `/sensors/${encodeURIComponent(sensorId)}${suffix}`);
}

export function sensorRoutes(send: SendJson): SensorRoutes {
  return {
    createSensor: async (pantinId, request) => {
      const valid = validInputOrThrow(CreateSensorRequestSchema, request);
      const url = pantinUrl(pantinId, "/sensors");
      return (await send(url, jsonRequest("POST", valid), SensorResponseSchema)).sensor;
    },
    updateSensor: async (pantinId, sensorId, request) => {
      const valid = validInputOrThrow(UpdateSensorRequestSchema, request);
      const url = sensorUrl(pantinId, sensorId);
      return (await send(url, jsonRequest("PATCH", valid), SensorResponseSchema)).sensor;
    },
    deleteSensor: (pantinId, sensorId) =>
      send(sensorUrl(pantinId, sensorId), jsonRequest("DELETE"), PantinResponseSchema),
    // Sent as typed: the core suggests a valid key for a bad one (ADR 0019).
    renameSensorTagKey: (pantinId, sensorId, tagKey) =>
      send(
        sensorUrl(pantinId, sensorId, "/tag-key"),
        jsonRequest("PUT", { tagKey }),
        RenamedTagsResponseSchema,
      ),
  };
}
