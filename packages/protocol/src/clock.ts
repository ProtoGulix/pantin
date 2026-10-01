import { z } from "zod";

// The simulation clock of an open Pantin (ADR 0032): runtime state, never saved.
//
//   GET  /api/pantins/:pantinId/clock       -> SimulationClockState
//   PUT  /api/pantins/:pantinId/clock       SetClockRunningRequest -> SimulationClockState
//        (pauses or resumes; setting the current value is accepted)
//   POST /api/pantins/:pantinId/clock/step  StepClockRequest -> SimulationClockState
//        (while paused only, 409 conflict while running; the steps run at once, and a
//        step that throws stops the request: `step` shows how many were run)
//
// Simulated time is `step` x `stepSeconds`, computed by the client for display
// only, never sent as a float.

export const MAX_CLOCK_STEPS = 1200;

export const SimulationClockStateSchema = z.object({
  running: z.boolean(),
  step: z.number().int().nonnegative(),
  stepSeconds: z.number().positive(),
  // Steps executed over steps due in the last second of running time; null
  // until that window has been filled once.
  achievedRatio: z.number().nonnegative().nullable(),
  // Steps the scheduler dropped under load since the Pantin was loaded.
  droppedSteps: z.number().int().nonnegative(),
});
export type SimulationClockState = z.infer<typeof SimulationClockStateSchema>;

export const SetClockRunningRequestSchema = z.object({ running: z.boolean() });
export type SetClockRunningRequest = z.infer<typeof SetClockRunningRequestSchema>;

export const StepClockRequestSchema = z.object({
  steps: z.number().int().min(1).max(MAX_CLOCK_STEPS),
});
export type StepClockRequest = z.infer<typeof StepClockRequestSchema>;
