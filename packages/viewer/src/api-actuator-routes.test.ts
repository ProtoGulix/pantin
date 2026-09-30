import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import { pantinResponse } from "./test-fixtures.ts";

// Actuator routes (ADR 0028 point 10).

const actuator = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "main",
  type: "double_acting_cylinder" as const,
  extendSpeed: 0.2,
  retractSpeed: 0.3,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["slide"],
};
const { id: _id, ...request } = actuator;

describe("PantinApiClient actuators", () => {
  it("creates an actuator with POST and returns it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ actuator }, 201));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.createActuator("press", request)).toEqual(actuator);
    expect([
      requests[0]?.init?.method,
      requests[0]?.url,
      JSON.parse(String(requests[0]?.init?.body)),
    ]).toEqual(["POST", "/api/pantins/press/actuators", request]);
  });

  it("refuses an invalid actuator before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ actuator }, 201));
    const error = await captureError(
      createPantinApiClient(fetchFunction).createActuator("press", { ...request, extendSpeed: -1 }),
    );
    expect([error.kind, requests.length]).toEqual(["invalid_input", 0]);
  });

  it("replaces an actuator with PATCH, sending no feed to remove it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ actuator }));
    const { feed: _feed, ...withoutFeed } = request;
    await createPantinApiClient(fetchFunction).updateActuator("press", "cylinder", withoutFeed);
    // Parsed: only the content matters, not the order of the keys.
    const body: unknown = JSON.parse(String(requests[0]?.init?.body));
    expect([requests[0]?.init?.method, requests[0]?.url, body]).toEqual([
      "PATCH",
      "/api/pantins/press/actuators/cylinder",
      withoutFeed,
    ]);
  });

  it("deletes an actuator with DELETE and returns the Pantin", async () => {
    const pantin = pantinResponse(true);
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    expect(await createPantinApiClient(fetchFunction).deleteActuator("press", "a b")).toEqual(
      pantin,
    );
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "DELETE",
      "/api/pantins/press/actuators/a%20b",
    ]);
  });
});
