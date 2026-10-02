import type { Placement } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { fieldsToPlacement, placementToFields } from "../placement-units.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { setPlacementField } from "./placement-actions.ts";

// Typed placement values reach the request in SI and come back as typed (ADR 0034).

const stored = fieldsToPlacement({ x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 90 });
const base = pantinResponse(false);
const pantin = {
  ...base,
  document: {
    ...base.document,
    assemblies: base.document.assemblies.map((assembly) => ({ ...assembly, placement: stored })),
  },
};

const answer = { placement: stored, anchor: { kind: "world" as const } };
const recorder = () =>
  vi.fn(async (_pantinId: string, _key: string, _placement: Placement) => answer);

function openStore(setAssemblyPlacement: PantinApiClient["setAssemblyPlacement"]) {
  const store = testStore({
    getPantin: async () => pantin,
    listPantins: async () => [],
    setAssemblyPlacement,
  });
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const target = (field: "x" | "rz") =>
  ({ kind: "assemblyPlacement", pantinId: "press", key: "main", field }) as const;

describe("setPlacementField", () => {
  it("sends a typed X in metres with the rotation exactly as stored", async () => {
    const send = recorder();
    await setPlacementField(openStore(send), target("x"), "250,5");
    const [pantinId, key, placement] = send.mock.calls[0] ?? [];
    expect([pantinId, key]).toEqual(["press", "main"]);
    expect(placement?.translation).toEqual([0.2505, 0, 0]);
    expect(placement?.rotation).toEqual(stored.rotation);
  });

  it("sends a typed RZ as a quaternion that reads back as typed, translation as stored", async () => {
    const send = recorder();
    await setPlacementField(openStore(send), target("rz"), "-30");
    const [, , placement] = send.mock.calls[0] ?? [];
    expect(placement?.translation).toEqual(stored.translation);
    expect(placementToFields(placement ?? stored).rz).toBeCloseTo(-30, 9);
  });

  it("sends nothing for text that is not a number, and says so", async () => {
    const send = recorder();
    const store = openStore(send);
    await setPlacementField(store, target("x"), "abc");
    expect(send).not.toHaveBeenCalled();
    expect(store.state.message?.key).toBe("placement.invalid");
  });
});
