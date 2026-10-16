import type { BridgeStatus } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { bridgeStatusOf, RUNNING_STATUS } from "../bridge/bridge-fixtures.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { bridgeIntents, receiveBridge } from "./bridge-actions.ts";
import { accept, flush, openStore } from "./bridge-test-helpers.ts";
import { requestClose, resolvePrompt, setCloseStopsBridge } from "./session-actions.ts";

// The box "Also stop the bridge" and overlapping bridge requests (ADR 0050 points 7 and 8).

function asking() {
  const opened = openStore(accept, true);
  receiveBridge(opened.store, RUNNING_STATUS);
  requestClose(opened.store);
  return opened;
}

describe("closing with unsaved changes and an active bridge", () => {
  it("offers the box, checked by default", () => {
    const { store } = asking();
    expect(buildPromptView(store.state, createTranslator("fr"))?.checkbox).toEqual({
      label: "Arrêter aussi le pont",
      checked: true,
    });
    setCloseStopsBridge(store, false);
    expect(buildPromptView(store.state, createTranslator("en"))?.checkbox).toEqual({
      label: "Also stop the bridge",
      checked: false,
    });
  });

  it.each(["saveAndClose", "discardAndClose"] as const)(
    "%s stops the bridge first when the box is checked",
    async (action) => {
      const { store, sent } = asking();
      resolvePrompt(store, action);
      await flush();
      expect([sent, store.state.openPantin]).toEqual([[{ running: false }], null]);
    },
  );

  it.each(["saveAndClose", "discardAndClose"] as const)(
    "%s leaves the bridge alone when the box is unchecked",
    async (action) => {
      const { store, sent } = asking();
      setCloseStopsBridge(store, false);
      resolvePrompt(store, action);
      await flush();
      expect([sent, store.state.openPantin]).toEqual([[], null]);
    },
  );

  it.each(["saveAndClose", "discardAndClose"] as const)(
    "%s stays open with the error when the stop is refused",
    async (action) => {
      const refusal = new PantinApiError("api", "no", "bridge_unavailable", 503);
      const { store } = openStore(() => refusal, true);
      receiveBridge(store, RUNNING_STATUS);
      requestClose(store);
      resolvePrompt(store, action);
      await flush();
      expect(store.state.openPantin).not.toBeNull();
      expect(store.state.closePrompt).toBe(true);
      expect(store.state.message?.level).toBe("error");
    },
  );
});

describe("requests that overlap", () => {
  it("sends a single stop for a double click on Stop and close", async () => {
    const { store, sent } = openStore(accept);
    receiveBridge(store, RUNNING_STATUS);
    requestClose(store);
    resolvePrompt(store, "stopBridgeAndClose");
    resolvePrompt(store, "stopBridgeAndClose");
    await flush();
    expect(sent).toEqual([{ running: false }]);
  });

  it("keeps the core's refusal while the user edits the fields", async () => {
    const refusal = new PantinApiError("api", "listen must be private", "invalid_request", 400);
    const { store } = openStore(() => refusal);
    receiveBridge(store, bridgeStatusOf());
    bridgeIntents(store).startBridge();
    await flush();
    bridgeIntents(store).editBridgeAllow("10.0.0.5");
    bridgeIntents(store).chooseBridgeListen("192.168.56.1");
    expect(store.bridgeModel.networkError).toBe("listen must be private");
  });

  it("does not write an answer into the model of another Pantin", async () => {
    let release: (status: BridgeStatus) => void = () => undefined;
    const { store } = openStore(accept);
    store.ports.api.setBridge = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    receiveBridge(store, bridgeStatusOf());
    bridgeIntents(store).startBridge();
    store.update(withOpenPantin(store.state, { ...consolePantin, id: "other" }));
    store.requestedPantinId = "other";
    receiveBridge(store, bridgeStatusOf({ state: "running" }));
    release(bridgeStatusOf({ state: "starting" }));
    await flush();
    expect(store.bridgeModel.status?.state).toBe("running");
    expect(store.bridgeModel.pending).toBe(false);
  });
});
