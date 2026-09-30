import {
  CreateSensorRequestSchema,
  RenameTagKeyRequestSchema,
  UpdateSensorRequestSchema,
} from "@pantin/protocol";
import { type Parser, parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route, type RouteContext, sensorIdOf } from "./route-context.ts";

// Sensor routes (ADR 0023); the contract is in sensor-api.ts.

const SENSOR = ["pantins", ":pantinId", "sensors", ":sensorId"];

async function bodyOf<Output>(
  context: RouteContext,
  schema: Parser<Output>,
  what: string,
): Promise<Output> {
  return parseWithSchema(schema, await readJsonBody(context.request), what);
}

export const SENSOR_ROUTES: readonly Route[] = [
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "sensors"],
    handle: async (context) => {
      const request = await bodyOf(context, CreateSensorRequestSchema, "The sensor");
      const sensor = await context.service.createSensor(pantinIdOf(context), request);
      sendJson(context.response, 201, { sensor });
    },
  },
  {
    method: "PATCH",
    pattern: SENSOR,
    handle: async (context) => {
      const request = await bodyOf(context, UpdateSensorRequestSchema, "The sensor");
      const sensor = await context.service.updateSensor(
        pantinIdOf(context),
        sensorIdOf(context),
        request,
      );
      sendJson(context.response, 200, { sensor });
    },
  },
  {
    method: "DELETE",
    pattern: SENSOR,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.deleteSensor(pantinIdOf(context), sensorIdOf(context)),
      ),
  },
  {
    method: "PUT",
    pattern: [...SENSOR, "tag-key"],
    handle: async (context) => {
      const { tagKey } = await bodyOf(context, RenameTagKeyRequestSchema, "The new tag key");
      const answer = await context.service.renameSensorTagKey(
        pantinIdOf(context),
        sensorIdOf(context),
        tagKey,
      );
      sendJson(context.response, 200, answer);
    },
  },
];
