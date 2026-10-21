import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Grouper and Dégrouper routes (ADR 0055 points 6 and 7).

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

const answer = {
  pantin,
  deletedJoints: [{ id: "weld", name: "Weld" }],
  renamedTags: [{ from: "frame.rod.setpoint", to: "rod_group.rod.setpoint" }],
};

describe("PantinApiClient groupBodies", () => {
  it("posts the members to the groups route and parses the answer", async () => {
    const { fetchFunction, requests } = fakeFetch(
      jsonResponse({ ...answer, group: { key: "rod_group", name: "Rod group" } }, 201),
    );
    const request = { name: "Rod group", bodies: ["rod", "head"], assemblies: ["cap"] };
    const result = await createPantinApiClient(fetchFunction).groupBodies(
      "press",
      "frame",
      request,
    );
    expect(result.group).toEqual({ key: "rod_group", name: "Rod group" });
    expect(result.deletedJoints).toEqual(answer.deletedJoints);
    expect(requests[0]?.url).toBe("/api/pantins/press/assemblies/frame/groups");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBe(JSON.stringify(request));
  });

  it("refuses an empty group before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    const error = await captureError(
      createPantinApiClient(fetchFunction).groupBodies("press", "frame", {
        name: "Empty",
        bodies: [],
        assemblies: [],
      }),
    );
    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  it("keeps the core's sentence when it refuses", async () => {
    const refusal = { error: { code: "conflict", message: 'Joint "Slide" moves "Rod".' } };
    const { fetchFunction } = fakeFetch(jsonResponse(refusal, 409));
    const error = await captureError(
      createPantinApiClient(fetchFunction).groupBodies("press", "frame", {
        name: "G",
        bodies: ["rod"],
        assemblies: [],
      }),
    );
    expect(error.message).toContain('Joint "Slide" moves "Rod".');
  });
});

describe("PantinApiClient ungroupAssembly", () => {
  it("posts with no body to the ungroup route", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    const result = await createPantinApiClient(fetchFunction).ungroupAssembly("press", "rod_group");
    expect(result.renamedTags).toEqual(answer.renamedTags);
    expect(requests[0]?.url).toBe("/api/pantins/press/assemblies/rod_group/ungroup");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBeUndefined();
  });
});
