import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { bridgeStatusOf, RUNNING_STATUS } from "../bridge/bridge-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { bridgeIntents, receiveBridge } from "./bridge-actions.ts";
import { accept, flush, openStore } from "./bridge-test-helpers.ts";
import { requestClose, resolvePrompt } from "./session-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The bridge block's intents and the close choice (ADR 0050 points 7 and 8).

function intentsOf(store: ViewerStore) {
  return bridgeIntents(store);
}

describe("the bar's intents send the exact PUT bodies", () => {
  it("starts locally by default", async () => {
    const { store, sent } = openStore(accept);
    receiveBridge(store, bridgeStatusOf());
    intentsOf(store).startBridge();
    await flush();
    expect(sent).toEqual([{ running: true, listen: "127.0.0.1", allow: [] }]);
    expect(store.bridgeModel.status?.state).toBe("starting");
  });

  it("starts on the private network with the chosen address and allow list", async () => {
    const { store, sent } = openStore(accept);
    receiveBridge(store, bridgeStatusOf());
    const intents = intentsOf(store);
    intents.chooseBridgeNetwork("lan");
    intents.chooseBridgeListen("192.168.56.1");
    intents.editBridgeAllow("192.168.56.10, 192.168.56.0/24");
    intents.startBridge();
    await flush();
    expect(sent).toEqual([
      { running: true, listen: "192.168.56.1", allow: ["192.168.56.10", "192.168.56.0/24"] },
    ]);
  });

  it("restarts after a failure with the last network", async () => {
    const { store, sent } = openStore(accept);
    receiveBridge(store, bridgeStatusOf());
    receiveBridge(
      store,
      bridgeStatusOf({
        state: "failed",
        network: { listen: "192.168.56.1", allow: ["10.0.0.5"] },
        failure: { kind: "crashed", message: "m", exitCode: null, signal: "SIGKILL" },
      }),
    );
    intentsOf(store).startBridge();
    await flush();
    expect(sent).toEqual([{ running: true, listen: "192.168.56.1", allow: ["10.0.0.5"] }]);
  });

  it("stops with { running: false }", async () => {
    const { store, sent } = openStore(accept);
    receiveBridge(store, RUNNING_STATUS);
    intentsOf(store).stopBridge();
    await flush();
    expect(sent).toEqual([{ running: false }]);
  });
});

describe("the core's refusals", () => {
  it("shows a 400 under the fields, not in the message line", async () => {
    const refusal = new PantinApiError("api", "listen must be private", "invalid_request", 400);
    const { store } = openStore(() => refusal);
    receiveBridge(store, bridgeStatusOf());
    intentsOf(store).startBridge();
    await flush();
    expect(store.bridgeModel.networkError).toBe("listen must be private");
    expect(store.bridgeModel.pending).toBe(false);
    expect(store.state.message).toBeNull();
  });

  it("shows any other failure in the message line", async () => {
    const refusal = new PantinApiError("api", "slot taken", "conflict", 409);
    const { store } = openStore(() => refusal);
    receiveBridge(store, bridgeStatusOf());
    intentsOf(store).startBridge();
    await flush();
    expect(store.bridgeModel.networkError).toBeNull();
    expect(store.state.message?.level).toBe("error");
  });

  it("writes the bar in place with the status of the stream", () => {
    const { store, views } = openStore(accept);
    receiveBridge(store, RUNNING_STATUS);
    expect(views.at(-1)?.stateText).toBe("En marche");
  });
});

const labelsOf = (store: ViewerStore) =>
  buildPromptView(store.state, createTranslator("fr"))?.actions.map((entry) => entry.label);

describe("closing while the bridge is starting or running", () => {
  function asking(state: "starting" | "running" | "stopped", unsavedChanges = false) {
    const opened = openStore(accept, unsavedChanges);
    receiveBridge(opened.store, bridgeStatusOf({ state }));
    requestClose(opened.store);
    return opened;
  }

  it("closes at once when the bridge is not active", () => {
    const { store } = asking("stopped");
    expect(store.state.openPantin).toBeNull();
  });

  it.each(["starting", "running"] as const)("asks first when it is %s", (state) => {
    const { store } = asking(state);
    expect(store.state.openPantin).not.toBeNull();
    expect(buildPromptView(store.state, createTranslator("fr"))?.text).toContain(
      "Le pont automate continue de tourner",
    );
    expect(labelsOf(store)).toEqual([
      "Arrêter le pont et fermer",
      "Fermer sans arrêter le pont",
      "Annuler",
    ]);
  });

  it("stops the bridge, then closes", async () => {
    const { store, sent } = asking("running");
    resolvePrompt(store, "stopBridgeAndClose");
    await flush();
    expect(sent).toEqual([{ running: false }]);
    expect(store.state.openPantin).toBeNull();
  });

  it("closes without stopping when asked to leave the bridge running", async () => {
    const { store, sent } = asking("running");
    resolvePrompt(store, "closeKeepingBridge");
    await flush();
    expect([sent, store.state.openPantin]).toEqual([[], null]);
  });
});

describe("the close choice, continued", () => {
  function asking(state: "running", unsavedChanges = false) {
    const opened = openStore(accept, unsavedChanges);
    receiveBridge(opened.store, bridgeStatusOf({ state }));
    requestClose(opened.store);
    return opened;
  }

  it("stays open with the prompt when the stop is refused", async () => {
    const { store } = openStore(
      () => new PantinApiError("api", "no bridge", "bridge_unavailable", 503),
    );
    receiveBridge(store, RUNNING_STATUS);
    requestClose(store);
    resolvePrompt(store, "stopBridgeAndClose");
    await flush();
    expect(store.state.openPantin).not.toBeNull();
    expect(store.state.closePrompt).toBe(true);
    expect(store.state.message?.level).toBe("error");
  });

  it("cancels like any close prompt", () => {
    const { store } = asking("running");
    resolvePrompt(store, "cancelClose");
    expect([store.state.closePrompt, store.state.openPantin === null]).toEqual([false, false]);
  });

  it("keeps the three save choices and adds the notice when changes are unsaved", () => {
    const { store } = asking("running", true);
    expect(labelsOf(store)).toEqual(["Enregistrer", "Ne pas enregistrer", "Annuler"]);
    expect(buildPromptView(store.state, createTranslator("en"))?.text).toContain("keeps running");
  });
});
