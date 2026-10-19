import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

describe("PantinApiClient version", () => {
  it("reads the core version with GET /api/version", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ version: "0.2.0+8b4e4c4" }));
    expect(await createPantinApiClient(fetchFunction).getCoreVersion()).toBe("0.2.0+8b4e4c4");
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual(["GET", "/api/version"]);
  });

  it("refuses an answer without a version", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ version: "" }));
    const error = await captureError(createPantinApiClient(fetchFunction).getCoreVersion());
    expect(error).toBeInstanceOf(Error);
  });
});
