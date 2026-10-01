import { describe, expect, it } from "vitest";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { refreshTagValues } from "./drive-commands.ts";

// The drive runtime read with the tags is kept for the panel and the diagram.

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);

describe("refreshTagValues", () => {
  it("keeps the port states and diagnostics of each drive, and drops them with the Pantin", async () => {
    const runtime = { id: "valve", ports: { port_2: "exhaust" as const }, diagnostics: [] };
    const store = testStore({
      listTags: async () => ({ stepCount: 3, tags: [], drives: [{ ...runtime }] }),
    });
    store.requestedPantinId = pantin.id;
    // update() makes the store follow this Pantin, as opening it does.
    store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: true });
    await refreshTagValues(store);
    expect(store.driveRuntime.get("valve")).toEqual(runtime);
    store.update({ ...store.state, openPantin: null });
    expect(store.driveRuntime.size).toBe(0);
  });
});

describe("refreshTagValues with the inspector", () => {
  it("reads while the inspector shows live values, and stops once it is closed", async () => {
    let reads = 0;
    const store = testStore({
      listTags: async () => {
        reads += 1;
        return { stepCount: 0, tags: [], drives: [] };
      },
    });
    store.requestedPantinId = pantin.id;
    store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: true });
    await refreshTagValues(store);
    expect(reads).toBe(1);
    store.update({ ...store.state, inspectorOpen: false, centralLayout: "3d" });
    await refreshTagValues(store);
    expect(reads).toBe(1);
  });
});
