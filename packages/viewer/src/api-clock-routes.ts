import {
  SetClockRunningRequestSchema,
  type SimulationClockState,
  SimulationClockStateSchema,
  StepClockRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// The clock routes of the API client (ADR 0032 point 8). Every answer is the
// clock state after the call.

export interface ClockRoutes {
  getClock(pantinId: string): Promise<SimulationClockState>;
  // Pauses or resumes; setting the current value is accepted.
  setClockRunning(pantinId: string, running: boolean): Promise<SimulationClockState>;
  // While paused only: the core answers `conflict` while the Pantin runs.
  stepClock(pantinId: string, steps: number): Promise<SimulationClockState>;
}

export function clockRoutes(send: SendJson): ClockRoutes {
  return {
    getClock: (pantinId) =>
      send(pantinUrl(pantinId, "/clock"), jsonRequest("GET"), SimulationClockStateSchema),
    setClockRunning: async (pantinId, running) => {
      const request = validInputOrThrow(SetClockRunningRequestSchema, { running });
      return send(
        pantinUrl(pantinId, "/clock"),
        jsonRequest("PUT", request),
        SimulationClockStateSchema,
      );
    },
    stepClock: async (pantinId, steps) => {
      const request = validInputOrThrow(StepClockRequestSchema, { steps });
      return send(
        pantinUrl(pantinId, "/clock/step"),
        jsonRequest("POST", request),
        SimulationClockStateSchema,
      );
    },
  };
}
