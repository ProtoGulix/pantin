import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import { pantinResponse } from "./test-fixtures.ts";

// Sensor routes (ADR 0023).

const sensor = {
  id: "extended",
  tagKey: "extended",
  name: "Extended",
  assembly: "main",
  joint: "slide",
  type: "position_switch" as const,
  range: [0.098, 0.1] as [number, number],
  normallyClosed: false,
};
const { id: _id, tagKey: _tagKey, ...request } = sensor;

describe("PantinApiClient sensors", () => {
  it("creates a sensor with POST and returns it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ sensor }, 201));
    expect(await createPantinApiClient(fetchFunction).createSensor("press", request)).toEqual(
      sensor,
    );
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "POST",
      "/api/pantins/press/sensors",
    ]);
  });

  it("changes a sensor with PATCH, refusing an invalid one before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ sensor }));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.updateSensor("press", "extended", request)).toEqual(sensor);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "PATCH",
      "/api/pantins/press/sensors/extended",
    ]);
    const error = await captureError(
      client.updateSensor("press", "extended", { ...request, range: [0.1, 0] }),
    );
    expect([error.kind, requests.length]).toEqual(["invalid_input", 1]);
  });
});

describe("PantinApiClient sensor deletion and keys", () => {
  it("deletes a sensor with DELETE and returns the Pantin", async () => {
    const pantin = pantinResponse(true);
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    expect(await createPantinApiClient(fetchFunction).deleteSensor("press", "extended")).toEqual(
      pantin,
    );
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "DELETE",
      "/api/pantins/press/sensors/extended",
    ]);
  });

  it("renames a sensor's tag key with PUT, the id encoded in the URL", async () => {
    const answer = { pantin: pantinResponse(true), renamedTags: [] };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.renameSensorTagKey("press", "extended", "sortie")).toEqual(answer);
    expect([requests[0]?.url, requests[0]?.init?.body]).toEqual([
      "/api/pantins/press/sensors/extended/tag-key",
      JSON.stringify({ tagKey: "sortie" }),
    ]);
  });

  it("refuses a response that is not a sensor", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ sensor: { id: "x" } }, 201));
    const error = await captureError(
      createPantinApiClient(fetchFunction).createSensor("press", request),
    );
    expect(error.kind).toBe("invalid_response");
  });
});
