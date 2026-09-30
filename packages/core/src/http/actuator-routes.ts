import { CreateActuatorRequestSchema, UpdateActuatorRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { actuatorIdOf, pantinIdOf, type Route } from "./route-context.ts";

// Actuator routes (ADR 0028); the contract is in actuator-api.ts.

const ACTUATOR = ["pantins", ":pantinId", "actuators", ":actuatorId"];

export const ACTUATOR_ROUTES: readonly Route[] = [
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "actuators"],
    handle: async (context) => {
      const body = await readJsonBody(context.request);
      const request = parseWithSchema(CreateActuatorRequestSchema, body, "The actuator");
      const actuator = await context.service.createActuator(pantinIdOf(context), request);
      sendJson(context.response, 201, { actuator });
    },
  },
  {
    method: "PATCH",
    pattern: ACTUATOR,
    handle: async (context) => {
      const body = await readJsonBody(context.request);
      const request = parseWithSchema(UpdateActuatorRequestSchema, body, "The actuator");
      const actuator = await context.service.updateActuator(
        pantinIdOf(context),
        actuatorIdOf(context),
        request,
      );
      sendJson(context.response, 200, { actuator });
    },
  },
  {
    method: "DELETE",
    pattern: ACTUATOR,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.deleteActuator(pantinIdOf(context), actuatorIdOf(context)),
      ),
  },
];
