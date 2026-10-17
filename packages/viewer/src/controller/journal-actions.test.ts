import { describe, expect, it } from "vitest";
import { bridgeStatusOf } from "../bridge/bridge-fixtures.ts";
import type { JournalView } from "../bridge/bridge-journal.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { bridgeIntents, receiveBridge } from "./bridge-actions.ts";
import { flush } from "./bridge-test-helpers.ts";
import { testStore } from "./controller-test-helpers.ts";

// The bridge log window (ADR 0054 point 5): read on opening, again on each
// status of the stream, one read at a time, nothing swallowed.

function journalStore(readLog: () => Promise<string>) {
  const views: (JournalView | null)[] = [];
  const store = testStore({ getBridgeLog: readLog }, {}, undefined, {
    showBridgeJournal: (view) => views.push(view),
  });
  store.update(withOpenPantin(store.state, consolePantin));
  views.length = 0;
  const last = () => views[views.length - 1] ?? null;
  return { store, views, last, intents: bridgeIntents(store) };
}

describe("the bridge log window", () => {
  it("opens, reads the file and shows its lines", async () => {
    const { intents, last } = journalStore(
      async () =>
        "2026-10-17T10:00:00.000Z CORE INFO first\n2026-10-17T10:00:01.000Z CORE INFO second\n",
    );
    intents.openBridgeJournal();
    expect(last()?.placeholder).not.toBeNull();
    await flush();
    expect(last()?.entries.map((entry) => entry.message)).toEqual(["first", "second"]);
  });

  it("reads again on each bridge status while open", async () => {
    let reads = 0;
    const { store, intents, last } = journalStore(async () => `read ${++reads}`);
    intents.openBridgeJournal();
    await flush();
    receiveBridge(store, bridgeStatusOf());
    await flush();
    expect([reads, last()?.copyText]).toEqual([2, "read 2"]);
  });

  it("does not read on a status while closed", async () => {
    let reads = 0;
    const { store } = journalStore(async () => `read ${++reads}`);
    receiveBridge(store, bridgeStatusOf());
    await flush();
    expect(reads).toBe(0);
  });

  it("asks for one more read when a status arrives during a read", async () => {
    const releases: (() => void)[] = [];
    let reads = 0;
    const { store, intents } = journalStore(
      () => new Promise((resolve) => releases.push(() => resolve(`read ${++reads}`))),
    );
    intents.openBridgeJournal();
    receiveBridge(store, bridgeStatusOf());
    receiveBridge(store, bridgeStatusOf());
    expect(releases.length).toBe(1);
    releases[0]?.();
    await flush();
    expect(releases.length).toBe(2);
    releases[1]?.();
    await flush();
    expect([reads, store.journalModel.reading]).toEqual([2, false]);
  });
});

describe("the bridge log window between reads", () => {
  it("does not rebuild the window on an update that does not touch it", async () => {
    const { store, intents, views } = journalStore(
      async () => "2026-10-17T10:00:00.000Z CORE INFO a",
    );
    intents.openBridgeJournal();
    await flush();
    const drawn = views.length;
    store.update(store.state);
    store.update({ ...store.state });
    expect(views.length).toBe(drawn);
    store.update({ ...store.state, language: store.state.language === "fr" ? "en" : "fr" });
    expect(views.length).toBe(drawn + 1);
  });
});

describe("the bridge log filters", () => {
  const log = async () =>
    "2026-10-17T10:00:00.000Z CORE ERROR boom\n2026-10-17T10:00:01.000Z CORE INFO fine\n";

  it("hide a level and keep doing so after the window closes and opens again", async () => {
    const { intents, last } = journalStore(log);
    intents.openBridgeJournal();
    await flush();
    intents.toggleBridgeJournalLevel("error");
    expect(last()?.entries.map((entry) => entry.message)).toEqual(["fine"]);
    intents.closeBridgeJournal();
    intents.openBridgeJournal();
    await flush();
    expect(last()?.entries.map((entry) => entry.message)).toEqual(["fine"]);
  });

  it("show the level again on a second toggle", async () => {
    const { intents, last } = journalStore(log);
    intents.openBridgeJournal();
    await flush();
    intents.toggleBridgeJournalLevel("error");
    intents.toggleBridgeJournalLevel("error");
    expect(last()?.entries).toHaveLength(2);
  });
});

describe("the bridge log window, when things go wrong", () => {
  it("shows the error and keeps the text already read", async () => {
    let fail = false;
    const { store, intents, last } = journalStore(async () => {
      if (fail) {
        throw new Error("Cannot reach the Pantin core");
      }
      return "kept";
    });
    intents.openBridgeJournal();
    await flush();
    fail = true;
    receiveBridge(store, bridgeStatusOf());
    await flush();
    expect([last()?.errorText, last()?.copyText]).toEqual([
      "Lecture du journal impossible : Cannot reach the Pantin core",
      "kept",
    ]);
  });

  it("closes, and ignores an answer that arrives after", async () => {
    let release: (() => void) | null = null;
    const { intents, last, store } = journalStore(
      () => new Promise((resolve) => (release = () => resolve("late"))),
    );
    intents.openBridgeJournal();
    intents.closeBridgeJournal();
    expect(last()).toBeNull();
    (release as (() => void) | null)?.();
    await flush();
    expect([last(), store.journalModel.text]).toEqual([null, null]);
  });
});
