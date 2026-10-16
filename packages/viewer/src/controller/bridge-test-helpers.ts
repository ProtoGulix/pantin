import type { BridgeStatus, SetBridgeRequest } from "@pantin/protocol";
import { bridgeStatusOf } from "../bridge/bridge-fixtures.ts";
import type { BridgeView } from "../bridge/bridge-view.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";

// A store over a fake bridge API, for the tests of the bridge actions.

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export function openStore(
  answer: (request: SetBridgeRequest) => BridgeStatus | Error,
  unsavedChanges = false,
) {
  const sent: SetBridgeRequest[] = [];
  const views: (BridgeView | null)[] = [];
  const store = testStore(
    {
      setBridge: async (_id, request) => {
        sent.push(request);
        const result = answer(request);
        if (result instanceof Error) {
          throw result;
        }
        return result;
      },
      getPantin: async () => consolePantin,
      savePantin: async () => ({ ...consolePantin, unsavedChanges: false }),
      discardPantin: async () => ({ ...consolePantin, unsavedChanges: false }),
    },
    {},
    undefined,
    { showBridge: (view) => views.push(view) },
  );
  store.requestedPantinId = consolePantin.id;
  store.update(withOpenPantin(store.state, { ...consolePantin, unsavedChanges }));
  return { store, sent, views };
}

export const accept = (request: SetBridgeRequest) =>
  bridgeStatusOf({ state: request.running ? "starting" : "stopped" });
