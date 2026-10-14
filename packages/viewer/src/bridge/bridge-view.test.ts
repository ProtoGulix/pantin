import { BRIDGE_FAILURE_KINDS, type BridgeState } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator, LANGUAGES } from "../i18n/translate.ts";
import { bridgeStatusOf, FAILED_STATUS, RUNNING_STATUS } from "./bridge-fixtures.ts";
import { type BridgeModel, bridgeAfterStatus, INITIAL_BRIDGE_MODEL } from "./bridge-model.ts";
import { bridgeRedrawKey, buildBridgeView } from "./bridge-view.ts";

const fr = createTranslator("fr");
const en = createTranslator("en");

function modelOf(status: Parameters<typeof bridgeAfterStatus>[1], pending = false): BridgeModel {
  return { ...bridgeAfterStatus(INITIAL_BRIDGE_MODEL, status), pending };
}

function viewOf(status: Parameters<typeof bridgeAfterStatus>[1], pending = false) {
  const view = buildBridgeView(modelOf(status, pending), fr, "3d");
  if (view === null) {
    throw new Error("Expected a view.");
  }
  return view;
}

describe("the bridge block before any status", () => {
  it("is not shown", () => {
    expect(buildBridgeView(INITIAL_BRIDGE_MODEL, fr, "3d")).toBeNull();
  });
});

describe("the state chip and the button, for every state", () => {
  const cases: [BridgeState, string, string, string, boolean, boolean][] = [
    ["stopped", "Arrêté", "start", "Démarrer", true, false],
    ["starting", "Démarrage…", "stop", "Arrêter", true, true],
    ["running", "En marche", "stop", "Arrêter", true, true],
    ["stopping", "Arrêt…", "stop", "Arrêter", false, true],
    ["failed", "En échec", "restart", "Redémarrer", true, false],
  ];
  it.each(cases)("%s", (state, chip, kind, label, enabled, locked) => {
    const view = viewOf(bridgeStatusOf({ state }));
    expect([view.chipText, view.button, view.networkLocked]).toEqual([
      chip,
      { kind, label, enabled },
      locked,
    ]);
  });

  it("says the same in English", () => {
    const view = buildBridgeView(modelOf(FAILED_STATUS), en, "3d");
    expect([view?.chipText, view?.button.label]).toEqual(["Failed", "Restart"]);
    expect(buildBridgeView(modelOf(RUNNING_STATUS), en, "3d")?.localLabel).toBe(
      "Local only (127.0.0.1)",
    );
  });

  it("waits while a request is in flight", () => {
    expect(viewOf(bridgeStatusOf(), true).button.enabled).toBe(false);
    expect(viewOf(RUNNING_STATUS, true).button.enabled).toBe(false);
  });
});

describe("the network", () => {
  it("offers the local choice and the private network, with the core's choices", () => {
    const view = viewOf(bridgeStatusOf());
    expect([view.localLabel, view.lanLabel, view.listenChoices, view.showLanFields]).toEqual([
      "Local uniquement (127.0.0.1)",
      "Réseau privé",
      ["127.0.0.1", "192.168.56.1"],
      false,
    ]);
  });

  it("shows the address and the allow list of a failure, locked while running", () => {
    const failed = viewOf(FAILED_STATUS);
    expect([failed.showLanFields, failed.listen, failed.allowText, failed.networkLocked]).toEqual([
      true,
      "192.168.56.1",
      "192.168.56.10, 192.168.56.0/24",
      false,
    ]);
    expect(viewOf({ ...FAILED_STATUS, state: "running" }).networkLocked).toBe(true);
  });

  it("shows the core's refusal under the fields", () => {
    const model = { ...modelOf(bridgeStatusOf()), networkError: "listen address is public" };
    expect(buildBridgeView(model, fr, "3d")?.networkError).toBe("listen address is public");
  });
});

describe("a running bridge", () => {
  it("lists a line per module and says that an I/O edit stops it", () => {
    const view = viewOf(RUNNING_STATUS);
    expect(view.moduleLines).toEqual([
      "m1 · 127.0.0.1:1502 · automate connecté",
      "m2 · 127.0.0.1:1503 · aucun automate",
    ]);
    expect(view.runningHint).toBe("Toute modification des E/S arrête le pont.");
  });

  it("has no module line nor hint in the other states", () => {
    for (const state of ["stopped", "starting", "stopping", "failed"] as const) {
      const view = viewOf({ ...RUNNING_STATUS, state });
      expect([view.moduleLines, view.runningHint]).toEqual([[], null]);
    }
  });
});

describe("a failed bridge", () => {
  it("shows the headline, the bridge's message and its log", () => {
    expect(viewOf(FAILED_STATUS).failure).toEqual({
      headline: "Le pont refuse sa configuration",
      message: "port 1502 is taken",
      warning: false,
      logTitle: "Journal du pont",
      log: ["pantin-bridge: port 1502 is taken"],
    });
  });

  it("translates every failure kind, in both languages", () => {
    for (const language of LANGUAGES) {
      const headlines = BRIDGE_FAILURE_KINDS.map((kind) => {
        const failure = { kind, message: "m", exitCode: null, signal: null };
        const model = modelOf({ ...FAILED_STATUS, failure });
        return buildBridgeView(model, createTranslator(language), "3d")?.failure?.headline;
      });
      expect(
        headlines.every((headline) => headline !== undefined && !headline.startsWith("bridge.")),
      ).toBe(true);
      expect(new Set(headlines).size).toBe(BRIDGE_FAILURE_KINDS.length);
    }
  });

  it("shows an I/O change as a warning", () => {
    const failure = { kind: "mapping_changed", message: "m", exitCode: 1, signal: null } as const;
    expect(viewOf({ ...FAILED_STATUS, failure }).failure?.warning).toBe(true);
  });

  it("shows no failure block without a failure", () => {
    expect(viewOf({ ...FAILED_STATUS, failure: null }).failure).toBeNull();
  });
});

describe("a bridge that cannot be started", () => {
  it("disables everything and says how to enable it when the core has no bridge", () => {
    const view = viewOf(bridgeStatusOf({ availability: "unavailable" }));
    expect([view.button.enabled, view.networkLocked, view.notice]).toEqual([
      false,
      true,
      "Démarrez le cœur avec --bridge-python <chemin> (pnpm setup:python).",
    ]);
  });

  it("disables Start when a bridge started outside Pantin is connected", () => {
    const view = viewOf(bridgeStatusOf({ externalBridgeConnected: true }));
    expect([view.button.enabled, view.notice]).toEqual([
      false,
      "Un pont lancé hors de Pantin est connecté.",
    ]);
  });

  it("disables Restart too, but never Stop", () => {
    expect(viewOf({ ...FAILED_STATUS, externalBridgeConnected: true }).button.enabled).toBe(false);
    const running = viewOf({ ...RUNNING_STATUS, externalBridgeConnected: true });
    expect([running.button.enabled, running.notice]).toEqual([true, null]);
  });
});

describe("the I/O shortcut", () => {
  it("is active only in the I/O layout", () => {
    const model = modelOf(RUNNING_STATUS);
    expect(buildBridgeView(model, fr, "io")?.configureIo).toEqual({
      label: "Configurer les E/S",
      active: true,
    });
    expect(buildBridgeView(model, en, "both")?.configureIo).toEqual({
      label: "Configure I/O",
      active: false,
    });
  });
});

describe("the network summary", () => {
  it("tells the mode and opens by itself on a refusal", () => {
    const model = modelOf(bridgeStatusOf());
    const local = buildBridgeView(model, fr, "3d");
    expect([local?.networkTitle, local?.networkForcedOpen]).toEqual(["Réseau : local", false]);
    const lan = { ...model, draft: { ...model.draft, mode: "lan" as const }, networkError: "bad" };
    const refused = buildBridgeView(lan, en, "3d");
    expect([refused?.networkTitle, refused?.networkForcedOpen]).toEqual([
      "Network: private network",
      true,
    ]);
  });
});

describe("the redraw key", () => {
  it("ignores a committed allow text, so that the Start button under the mouse is kept", () => {
    const refused = { ...modelOf(FAILED_STATUS), networkError: "bad entry" };
    const typed = {
      ...refused,
      draft: { ...refused.draft, allowText: "10.0.0.9" },
    };
    const before = buildBridgeView(refused, fr, "3d");
    const after = buildBridgeView(typed, fr, "3d");
    expect(before && after && bridgeRedrawKey(after)).toBe(before && bridgeRedrawKey(before));
    expect(after?.networkError).toBe("bad entry");
  });
});
