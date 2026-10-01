import type { SimulationClockState } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// The clock routes (ADR 0032 point 8).

const STATE: SimulationClockState = {
  running: false,
  step: 12,
  stepSeconds: 1 / 120,
  achievedRatio: null,
  droppedSteps: 0,
};

function sent(request: { init: RequestInit | undefined; url: string } | undefined) {
  return [request?.init?.method, request?.url, request?.init?.body];
}

describe("PantinApiClient clock", () => {
  it("reads the clock with GET and validates it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(STATE));
    expect(await createPantinApiClient(fetchFunction).getClock("press")).toEqual(STATE);
    expect(sent(requests[0])).toEqual(["GET", "/api/pantins/press/clock", undefined]);
  });

  it("pauses and resumes with PUT { running }", async () => {
    // A response body can be read once: one fake transport per call.
    const resume = fakeFetch(jsonResponse(STATE));
    const pause = fakeFetch(jsonResponse(STATE));
    await createPantinApiClient(resume.fetchFunction).setClockRunning("press", true);
    await createPantinApiClient(pause.fetchFunction).setClockRunning("press", false);
    expect([resume.requests[0], pause.requests[0]].map((request) => sent(request))).toEqual([
      ["PUT", "/api/pantins/press/clock", '{"running":true}'],
      ["PUT", "/api/pantins/press/clock", '{"running":false}'],
    ]);
  });

  it("steps with POST { steps } and returns the state after the steps", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ ...STATE, step: 22 }));
    const state = await createPantinApiClient(fetchFunction).stepClock("press", 10);
    expect(state.step).toBe(22);
    expect(sent(requests[0])).toEqual(["POST", "/api/pantins/press/clock/step", '{"steps":10}']);
  });

  it("refuses a step count the protocol forbids, without a request", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(STATE));
    const error = await captureError(createPantinApiClient(fetchFunction).stepClock("press", 0));
    expect([error.kind, requests]).toEqual(["invalid_input", []]);
  });

  it("refuses an answer that does not match the protocol", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ ...STATE, step: -1 }));
    const error = await captureError(createPantinApiClient(fetchFunction).getClock("press"));
    expect(error.kind).toBe("invalid_response");
  });
});
