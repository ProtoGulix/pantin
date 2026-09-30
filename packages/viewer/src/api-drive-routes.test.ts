import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Drive, fault and tag routes (ADR 0022).

const drive = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "main",
  joints: ["slide"],
  type: "double_acting_cylinder" as const,
  speed: 0.2,
};
const { id: _id, tagKey: _tagKey, ...request } = drive;
const faults = { jammedJoints: [], unresponsiveDrives: ["valve"] };

describe("PantinApiClient drives", () => {
  it("creates a drive with POST and returns it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ drive }, 201));
    expect(await createPantinApiClient(fetchFunction).createDrive("press", request)).toEqual(drive);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "POST",
      "/api/pantins/press/drives",
    ]);
  });

  it("refuses an invalid drive before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ drive }, 201));
    const error = await captureError(
      createPantinApiClient(fetchFunction).createDrive("press", { ...request, speed: -1 }),
    );
    expect([error.kind, requests.length]).toEqual(["invalid_input", 0]);
  });

  it("sets a drive fault with PUT and returns the faults", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(faults));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.setDriveFault("press", "valve", "unresponsive")).toEqual(faults);
    expect([requests[0]?.url, requests[0]?.init?.body]).toEqual([
      "/api/pantins/press/drives/valve/fault",
      JSON.stringify({ fault: "unresponsive" }),
    ]);
  });

  it("writes a tag with PUT, its name encoded in the URL", async () => {
    const tag = { name: "main.valve.extend", type: "bit", direction: "command", value: 1 };
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ tag }));
    expect(
      await createPantinApiClient(fetchFunction).writeTag("press", "main.valve.extend", 1),
    ).toEqual(tag);
    expect(requests[0]?.url).toBe("/api/pantins/press/tags/main.valve.extend");
  });
});
