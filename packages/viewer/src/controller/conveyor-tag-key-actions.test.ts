import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { commitPropertyEdit } from "./property-actions.ts";

// A tag key typed in the inspector of an emitter or a presence sensor renames
// its tags, and the message line lists how many (ADR 0019, ADR 0043).

const translate = createTranslator("fr");
const pantin = pantinResponse(true);

function openStore(api: Parameters<typeof testStore>[0]) {
  const store = testStore({ getPantin: async () => pantin, listPantins: async () => [], ...api });
  store.requestedPantinId = "press";
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const answer = (from: string, to: string) => ({ pantin, renamedTags: [{ from, to }] });

describe("a tag key edit of a conveyor object", () => {
  it("renames an emitter's tag key through its own route and reports the renamed tags", async () => {
    const renameEmitterTagKey = vi.fn(async () => answer("main.source.spawn", "main.feeder.spawn"));
    const store = openStore({ renameEmitterTagKey });
    const target = {
      kind: "conveyorTagKey",
      pantinId: "press",
      owner: { kind: "emitter", id: "source" },
    } as const;
    await commitPropertyEdit(store, target, "feeder");
    expect(renameEmitterTagKey).toHaveBeenCalledWith("press", "source", "feeder");
    const message = store.state.message;
    expect(message === null ? "" : translate(message.key, message.parameters)).toContain(
      "1 tag renommé",
    );
  });

  it("renames a presence sensor's tag key through its own route", async () => {
    const renamePresenceSensorTagKey = vi.fn(async () =>
      answer("main.cell.state", "main.eye.state"),
    );
    const store = openStore({ renamePresenceSensorTagKey });
    const target = {
      kind: "conveyorTagKey",
      pantinId: "press",
      owner: { kind: "presenceSensor", id: "cell" },
    } as const;
    await commitPropertyEdit(store, target, "eye");
    expect(renamePresenceSensorTagKey).toHaveBeenCalledWith("press", "cell", "eye");
  });
});
