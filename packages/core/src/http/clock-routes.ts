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
      const before = await context.service.getClock(pantinId);
      const state = await context.service.setClockRunning(pantinId, running);
      if (before.running !== running) {
        context.poseStreams.notifyClockChange(pantinId, { withPose: false });
      }
      sendJson(context.response, 200, state);
    },
  },
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "clock", "step"],
    handle: async (context) => {
      const pantinId = pantinIdOf(context);
      const body = await readJsonBody(context.request);
      const { steps } = parseWithSchema(StepClockRequestSchema, body, "The step request");
      const state = await context.service.stepClock(pantinId, steps);
      // Paused time sends no pose by itself: the viewer gets the result at once
      // instead of waiting for the next wall-clock check.
      context.poseStreams.notifyClockChange(pantinId, { withPose: true });
      sendJson(context.response, 200, state);
    },
  },
];
