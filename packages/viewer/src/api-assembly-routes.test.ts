import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Assembly and key routes (ADR 0019).

const pantin = {
  id: "press",
  unsavedChanges: true,
  document: {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Press",
    assemblies: [{ key: "verin_pince", name: "Vérin pince" }],
    bodies: [],
    joints: [],
    drives: [],
  },
};

const renamed = {
  pantin,
  renamedTags: [{ from: "id1s0400125e-0.tige.setpoint", to: "verin_pince.tige.setpoint" }],
};

describe("PantinApiClient assemblies", () => {
  it.each([
    [
      "createAssembly",
      ["press", "Spare"],
      "POST",
      "/api/pantins/press/assemblies",
      { name: "Spare" },
    ],
    [
      "renameAssembly",
      ["press", "main", "Main"],
      "PATCH",
      "/api/pantins/press/assemblies/main",
      { name: "Main" },
    ],
    [
      "deleteAssembly",
      ["press", "main"],
      "DELETE",
      "/api/pantins/press/assemblies/main",
      undefined,
    ],
  ] as const)("%s sends %s", async (method, args, verb, url, body) => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    const client = createPantinApiClient(fetchFunction);
    const [pantinId, second, third] = args;
    if (method === "createAssembly") {
      await client.createAssembly(pantinId, second);
    } else if (method === "renameAssembly") {
      await client.renameAssembly(pantinId, second, third ?? "");
    } else {
      await client.deleteAssembly(pantinId, second);
    }
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([verb, url]);
    expect(requests[0]?.init?.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });
});

describe("PantinApiClient keys", () => {
  it("renames keys and moves bodies with PUT, returning the renamed tags", async () => {
    const calls = [
      (client: ReturnType<typeof createPantinApiClient>) =>
        client.renameAssemblyKey("press", "id1s0400125e-0", "verin_pince"),
      (client: ReturnType<typeof createPantinApiClient>) =>
        client.renameTagKey("press", "tige", "tige_pince"),
      (client: ReturnType<typeof createPantinApiClient>) =>
        client.moveBody("press", "rod-1", "verin_pince"),
    ];
    const sent: [string | undefined, unknown][] = [];
    for (const call of calls) {
      const { fetchFunction, requests } = fakeFetch(jsonResponse(renamed));
      expect(await call(createPantinApiClient(fetchFunction))).toEqual(renamed);
      sent.push([requests[0]?.url, requests[0]?.init?.body]);
    }
    expect(sent).toEqual([
      ["/api/pantins/press/assemblies/id1s0400125e-0/key", JSON.stringify({ key: "verin_pince" })],
      ["/api/pantins/press/joints/tige/tag-key", JSON.stringify({ tagKey: "tige_pince" })],
      ["/api/pantins/press/bodies/rod-1/assembly", JSON.stringify({ assembly: "verin_pince" })],
    ]);
  });

  it("sends a key as typed, so that the core's suggestion reaches the user", async () => {
    const refusal = { error: { code: "invalid_request", message: 'Try "verin-pince".' } };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(refusal, 400));
    const error = await captureError(
      createPantinApiClient(fetchFunction).renameAssemblyKey("press", "main", "Verin.Pince"),
    );
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ key: "Verin.Pince" }));
    expect(error.message).toContain('Try "verin-pince".');
  });
});
