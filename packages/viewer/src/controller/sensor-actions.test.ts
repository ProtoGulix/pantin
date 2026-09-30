import type { CreateSensorRequest, PantinResponse, Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { refreshTagValues } from "./drive-commands.ts";
import { addEndSwitches } from "./sensor-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// End-of-stroke switches from a joint's context menu (ADR 0023 point 7): the
// viewer must show every switch the core kept, even when the second fails.
// And the tag reads that light the sensors in 3D (ADR 0024).

function storeWith(api: Partial<PantinApiClient>, pantin: PantinResponse): ViewerStore {
  const store = testStore(api);
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const initial = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);

describe("addEndSwitches", () => {
  it("shows the first switch and reports the failure when the second is refused", async () => {
    const kept: Sensor[] = [];
    const createSensor = async (_pantinId: string, request: CreateSensorRequest) => {
      if (kept.length > 0) {
        throw new Error("The core refused the second switch.");
      }
      const sensor: Sensor = { id: "slide-min", tagKey: "slide-min", ...request };
      kept.push(sensor);
      return sensor;
    };
    const getPantin = async () => ({
      ...initial,
      unsavedChanges: true,
      document: { ...initial.document, sensors: [...kept] },
    });
    const store = storeWith({ createSensor, getPantin, listPantins: async () => [] }, initial);
    await addEndSwitches(store, jointNodeId("press", "slide"));
    expect(store.state.openPantin?.document.sensors.map((sensor) => sensor.name)).toEqual([
      "Slide min",
    ]);
    expect(store.state.message?.level).toBe("error");
  });
});

describe("refreshTagValues", () => {
  const withSensor = {
    ...initial,
    document: {
      ...initial.document,
      sensors: [
        {
          id: "count",
          tagKey: "count",
          name: "Count",
          assembly: "main",
          joint: "slide",
          type: "encoder" as const,
          pulsesPerUnit: 1000,
        },
      ],
    },
  };
  const readsWith = async (pantin: PantinResponse, panelOpen: boolean) => {
    let reads = 0;
    const listTags = async () => {
      reads += 1;
      return { stepCount: 0, tags: [], drives: [] };
    };
    const store = storeWith({ listTags }, pantin);
    store.state = { ...store.state, drivePanelOpen: panelOpen };
    await refreshTagValues(store);
    return reads;
  };

  it("reads the tags with the panel closed when the Pantin has sensors (ADR 0024)", async () => {
    expect(await readsWith(withSensor, false)).toBe(1);
  });

  it("reads nothing with the panel closed and no sensor, and reads with the panel open", async () => {
    expect(await readsWith(initial, false)).toBe(0);
    expect(await readsWith(initial, true)).toBe(1);
  });
});
