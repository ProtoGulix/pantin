import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import { answerOf, entryOf } from "./console/console-fixtures.ts";

// The console route (ADR 0031 point 4).

describe("PantinApiClient console", () => {
  it("reads the entries after a sequence with GET and validates them", async () => {
    const answer = answerOf([entryOf(4, { firstSequence: 2, count: 3 })]);
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    expect(await createPantinApiClient(fetchFunction).getConsole("press", 3)).toEqual(answer);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "GET",
      "/api/pantins/press/console?after=3",
    ]);
  });

  it("sets verbose mode with PUT and returns the core's value", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ verbose: true }));
    expect(await createPantinApiClient(fetchFunction).setConsoleVerbose("press", true)).toEqual({
      verbose: true,
    });
    expect([requests[0]?.init?.method, requests[0]?.url, requests[0]?.init?.body]).toEqual([
      "PUT",
      "/api/pantins/press/console",
      JSON.stringify({ verbose: true }),
    ]);
  });

  it("refuses an answer that does not match the protocol", async () => {
    const { fetchFunction } = fakeFetch(
      jsonResponse({
        entries: [{ code: "unknown" }],
        consoleId: "c",
        lastSequence: 1,
        verbose: false,
      }),
    );
    const error = await captureError(createPantinApiClient(fetchFunction).getConsole("press", 0));
    expect(error.kind).toBe("invalid_response");
  });
});
