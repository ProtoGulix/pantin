import type { CreateSensorRequest, PantinResponse, Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import type { Viewport } from "../scene/viewport.ts";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { addEndSwitches } from "./sensor-actions.ts";
import { ViewerStore } from "./viewer-store.ts";

// End-of-stroke switches from a joint's context menu (ADR 0023 point 7): the
// viewer must show every switch the core kept, even when the second fails.

// Every port method does nothing: this test reads the store's state only.
function silent<Port extends object>(): Port {
  // A Proxy has no static type: each property it returns is a no-op function,
  // which is all the store calls on these ports.
  return new Proxy({}, { get: () => () => undefined }) as Port;
}

function storeWith(api: Partial<PantinApiClient>, pantin: PantinResponse): ViewerStore {
  const store = new ViewerStore(
    {
      // Only the calls this test makes: the others would fail loudly as undefined.
      api: api as PantinApiClient,
      renderPanel: () => undefined,
      showJointPositions: () => undefined,
      showTagValues: () => undefined,
      viewport: () => silent<Viewport>(),
      poseStream: { follow: () => undefined },
      storeLanguage: () => undefined,
    },
    "fr",
  );
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
