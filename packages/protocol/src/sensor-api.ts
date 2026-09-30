import { z } from "zod";
import { CreateSensorRequestSchema, SensorSchema } from "./sensor.ts";

// Joint sensors (ADR 0023), under API_PREFIX:
//
//   POST   /api/pantins/:pantinId/sensors  CreateSensorRequest -> 201 SensorResponse
//   PATCH  /api/pantins/:pantinId/sensors/:sensorId  UpdateSensorRequest -> SensorResponse
//          (every field but the id and the tag key; the type may change)
//   DELETE /api/pantins/:pantinId/sensors/:sensorId  -> PantinResponse
//   PUT    /api/pantins/:pantinId/sensors/:sensorId/tag-key  RenameTagKeyRequest
//          -> RenamedTagsResponse
//
// A sensor's tags are feedback: read like any tag (tag.ts), never written.

export const SensorResponseSchema = z.object({ sensor: SensorSchema });
export type SensorResponse = z.infer<typeof SensorResponseSchema>;

// The whole sensor without its id and tag key, as for creation.
export const UpdateSensorRequestSchema = CreateSensorRequestSchema;
export type UpdateSensorRequest = z.infer<typeof UpdateSensorRequestSchema>;
