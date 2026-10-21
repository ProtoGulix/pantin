import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Redundant fixed joint routes (ADR 0060).

const list = {
  redundant: [{ id: "star-a", name: "Star A", assembly: { key: "frame", name: "Frame" } }],
  kept: [],
};

const pantin = {
  id: "press",
  unsavedChanges: true,
  changedOutside: [],
  document: {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Press",
    assemblies: [],
    bodies: [],
    joints: [],
    drives: [],
    actuators: [],
    sensors: [],
    belts: [],
    guides: [],
    emitters: [],
    absorbers: [],
    presenceSensors: [],
  },
};

describe("PantinApiClient redundant joints", () => {
  it("gets the preview from the redundant-joints route", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(list));
    const result = await createPantinApiClient(fetchFunction).listRedundantJoints("press");
    expect(requests[0]?.url).toBe("/api/pantins/press/redundant-joints");
    expect(requests[0]?.init?.method).toBe("GET");
    expect(result).toEqual(list);
  });

  it("posts the ids to the delete route and parses the answer", async () => {
    const answer = { pantin, deletedJoints: [{ id: "star-a", name: "Star A" }], skipped: ["x"] };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    const result = await createPantinApiClient(fetchFunction).deleteRedundantJoints("press", [
      "star-a",
      "x",
    ]);
    expect(requests[0]?.url).toBe("/api/pantins/press/redundant-joints/delete");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ jointIds: ["star-a", "x"] });
    expect(result).toEqual(answer);
  });

  it("refuses an empty id list before any request", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({}));
    const error = await captureError(
      createPantinApiClient(fetchFunction).deleteRedundantJoints("press", []),
    );
    expect(error.kind).toBe("invalid_input");
    expect(requests).toEqual([]);
  });

  it("refuses an answer that does not match the schema", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ redundant: [] }));
    const error = await captureError(createPantinApiClient(fetchFunction).listRedundantJoints("p"));
    expect(error.kind).toBe("invalid_response");
  });
});
