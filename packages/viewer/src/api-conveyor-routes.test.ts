import { describe, expect, it } from "vitest";
import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import {
  beamCell,
  cartonSource,
  exitSink,
  feedBelt,
  sideGuide,
} from "./conveyors/conveyor-fixtures.ts";
import { pantinResponse } from "./test-fixtures.ts";

// Belt, guide, emitter, absorber and presence sensor routes, and the reset (ADR 0043 point 12).

function withoutIds<Item extends { id: string }>(item: Item) {
  const { id: _id, ...request } = item;
  return request;
}

function withoutKeys<Item extends { id: string; tagKey: string }>(item: Item) {
  const { id: _id, tagKey: _tagKey, ...request } = item;
  return request;
}

const creations = [
  {
    path: "belts",
    field: "belt",
    stored: feedBelt,
    create: (client: PantinApiClient) => client.createBelt("press", withoutIds(feedBelt)),
  },
  {
    path: "guides",
    field: "guide",
    stored: sideGuide,
    create: (client: PantinApiClient) => client.createGuide("press", withoutIds(sideGuide)),
  },
  {
    path: "emitters",
    field: "emitter",
    stored: cartonSource,
    create: (client: PantinApiClient) => client.createEmitter("press", withoutKeys(cartonSource)),
  },
  {
    path: "absorbers",
    field: "absorber",
    stored: exitSink,
    create: (client: PantinApiClient) => client.createAbsorber("press", withoutIds(exitSink)),
  },
  {
    path: "presence-sensors",
    field: "presenceSensor",
    stored: beamCell,
    create: (client: PantinApiClient) =>
      client.createPresenceSensor("press", withoutKeys(beamCell)),
  },
];

describe("PantinApiClient phase 6 creation", () => {
  it("creates each kind with POST on its own path and returns the stored object", async () => {
    for (const { path, field, stored, create } of creations) {
      const { fetchFunction, requests } = fakeFetch(jsonResponse({ [field]: stored }, 201));
      expect(await create(createPantinApiClient(fetchFunction))).toEqual(stored);
      expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
        "POST",
        `/api/pantins/press/${path}`,
      ]);
    }
  });
});

describe("PantinApiClient phase 6 edits", () => {
  it("replaces an object with PATCH and refuses an invalid one before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ belt: feedBelt }));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.updateBelt("press", "feed", withoutIds(feedBelt))).toEqual(feedBelt);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "PATCH",
      "/api/pantins/press/belts/feed",
    ]);
    const error = await captureError(
      client.updateBelt("press", "feed", { ...withoutIds(feedBelt), length: 0 }),
    );
    expect([error.kind, requests.length]).toEqual(["invalid_input", 1]);
  });

  it("lets a presence sensor change type or mode with PATCH", async () => {
    const changed = { ...beamCell, mode: "through_beam" as const };
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ presenceSensor: changed }));
    const client = createPantinApiClient(fetchFunction);
    expect(await client.updatePresenceSensor("press", "cell", withoutKeys(changed))).toEqual(
      changed,
    );
    expect(requests[0]?.url).toBe("/api/pantins/press/presence-sensors/cell");
  });
});

describe("PantinApiClient phase 6 deletion and reset", () => {
  it("deletes with DELETE, the id encoded in the URL, and returns the Pantin", async () => {
    const pantin = pantinResponse(true);
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    expect(await createPantinApiClient(fetchFunction).deleteEmitter("press", "a b")).toEqual(
      pantin,
    );
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "DELETE",
      "/api/pantins/press/emitters/a%20b",
    ]);
  });

  it("shows the core's refusal of a drum still in use as a typed error", async () => {
    const refusal = { error: { code: "conflict", message: 'Belt "feed" turns on "spin".' } };
    const { fetchFunction } = fakeFetch(jsonResponse(refusal, 409));
    const error = await captureError(
      createPantinApiClient(fetchFunction).deleteBelt("press", "feed"),
    );
    expect([error.kind, error.code, error.status, error.message]).toEqual([
      "api",
      "conflict",
      409,
      'Belt "feed" turns on "spin".',
    ]);
  });

  it("resets the runtime with POST /reset and returns the Pantin", async () => {
    const pantin = pantinResponse(true);
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    expect(await createPantinApiClient(fetchFunction).resetPantin("press")).toEqual(pantin);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "POST",
      "/api/pantins/press/reset",
    ]);
  });
});
