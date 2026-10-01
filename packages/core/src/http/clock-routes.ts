import { SetClockRunningRequestSchema, StepClockRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Simulation clock routes (ADR 0032 point 8).
export const CLOCK_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "clock"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.getClock(pantinIdOf(context))),
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "clock"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const body = await readJsonBody(context.request);
      const { running } = parseWithSchema(SetClockRunningRequestSchema, body, "The clock request");
      sendJson(context.response, 200, await context.service.setClockRunning(pantinId, running));
    },
  },
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "clock", "step"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const body = await readJsonBody(context.request);
      const { steps } = parseWithSchema(StepClockRequestSchema, body, "The step request");
      sendJson(context.response, 200, await context.service.stepClock(pantinId, steps));
    },
  },
];
