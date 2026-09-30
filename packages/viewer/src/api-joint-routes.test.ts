import { type Joint, PANTIN_SCHEMA_VERSION, type PoseResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

const slide: Joint = {
  id: "slide",
  tagKey: "slide",
  name: "Slide",
  type: "prismatic",
  parent: "rail",
  child: "carriage",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.1],
};

const pose: PoseResponse = {
  jointPositions: [{ jointId: "slide", position: 0.05 }],
  bodies: [
    { bodyId: "rail", translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    { bodyId: "carriage", translation: [0.05, 0, 0], rotation: [0, 0, 0, 1] },
  ],
};

describe("PantinApiClient joints", () => {
  it("lists the validated joints of a Pantin", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ joints: [slide] }));
    const joints = await createPantinApiClient(fetchFunction).listJoints("press");
    expect(joints).toEqual([slide]);
    expect(requests[0]?.url).toBe("/api/pantins/press/joints");
  });

  it("creates a joint with POST and returns it", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ joint: slide }, 201));
    const { id: _id, tagKey: _tagKey, ...request } = slide;
    const joint = await createPantinApiClient(fetchFunction).createJoint("press", request);
    expect(joint).toEqual(slide);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(request);
  });

  it("refuses to send a joint whose lower limit exceeds the upper one", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ joint: slide }, 201));
    const { id: _id, tagKey: _tagKey, ...request } = slide;
    const error = await captureError(
      createPantinApiClient(fetchFunction).createJoint("press", { ...request, limits: [1, 0] }),
    );
    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  it("deletes a joint with DELETE and returns the validated Pantin", async () => {
    const pantin = {
      id: "press",
      unsavedChanges: true,
      document: {
        schema_version: PANTIN_SCHEMA_VERSION,
        name: "Press",
        assemblies: [],
        bodies: [],
        joints: [],
        drives: [],
      },
    };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    const response = await createPantinApiClient(fetchFunction).deleteJoint("press", "slide");
    expect(response.unsavedChanges).toBe(true);
    expect(requests[0]?.url).toBe("/api/pantins/press/joints/slide");
    expect(requests[0]?.init?.method).toBe("DELETE");
  });
});

describe("PantinApiClient pose", () => {
  it("reads the current pose", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pose));
    expect(await createPantinApiClient(fetchFunction).getPose("press")).toEqual(pose);
    expect(requests[0]?.url).toBe("/api/pantins/press/pose");
  });

  it("sets a joint position with PUT and returns the new pose", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pose));
    const response = await createPantinApiClient(fetchFunction).setJointPosition(
      "press",
      "slide",
      0.05,
    );
    expect(response).toEqual(pose);
    expect(requests[0]?.url).toBe("/api/pantins/press/joints/slide/position");
    expect(requests[0]?.init?.method).toBe("PUT");
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ position: 0.05 }));
  });

  it("refuses to send a position that is not finite", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pose));
    const error = await captureError(
      createPantinApiClient(fetchFunction).setJointPosition("press", "slide", Number.NaN),
    );
    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});

describe("PantinApiClient updateJoint", () => {
  const { id: _id, tagKey: _tagKey, ...request } = slide;

  it("patches the joint by id and returns the answer", async () => {
    const renamed = { ...slide, name: "Slider" };
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ joint: renamed }));
    const joint = await createPantinApiClient(fetchFunction).updateJoint("press", "slide", {
      ...request,
      name: "Slider",
    });
    expect(joint).toEqual(renamed);
    expect(requests[0]?.url).toBe("/api/pantins/press/joints/slide");
    expect(requests[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ ...request, name: "Slider" });
  });

  it("refuses to send an invalid joint", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ joint: slide }));
    const error = await captureError(
      createPantinApiClient(fetchFunction).updateJoint("press", "slide", {
        ...request,
        limits: [1, 0],
      }),
    );
    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});
