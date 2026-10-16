import type { CreateBeltRequest, CreatePresenceSensorRequest } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { beamCell, conveyorPantin, feedBelt } from "../conveyors/conveyor-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { commitDeviceEdit } from "./device-edit-actions.ts";
import { refreshTagValues } from "./drive-commands.ts";
import { runMenuCommand } from "./menu-commands.ts";

// A field of a phase 6 object committed in the inspector's grid (ADR 0043
// point 13) goes through the same form and request builder as the form.

const pantin = conveyorPantin();

function openStore(api: Partial<PantinApiClient>) {
  const store = testStore({ getPantin: async () => pantin, listPantins: async () => [], ...api });
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const edit = (kind: "belt" | "presenceSensor" | "guide", id: string, fieldId: string) =>
  ({ kind: "deviceField", device: { kind, id }, fieldId }) as const;

describe("commitDeviceEdit on a phase 6 object", () => {
  it("resends the belt with the typed size converted to metres", async () => {
    const updateBelt = vi.fn(async (_: string, id: string, __: CreateBeltRequest) => ({
      ...feedBelt,
      id,
    }));
    const store = openStore({ updateBelt });
    await commitDeviceEdit(store, edit("belt", "feed", "length"), "2500");
    expect(updateBelt.mock.calls[0]?.[1]).toBe("feed");
    expect(updateBelt.mock.calls[0]?.[2]).toMatchObject({ name: "Feed", length: 2.5, width: 0.3 });
    expect(store.state.message?.key).toBe("message.belt.updated");
  });

  it("renames it, and changes a cell's range and mode through the same call", async () => {
    const updatePresenceSensor = vi.fn(
      async (_: string, id: string, __: CreatePresenceSensorRequest) => ({ ...beamCell, id }),
    );
    const store = openStore({ updatePresenceSensor });
    await commitDeviceEdit(store, edit("presenceSensor", "cell", "name"), "Entry cell");
    await commitDeviceEdit(store, edit("presenceSensor", "cell", "mode"), "through_beam");
    await commitDeviceEdit(store, edit("presenceSensor", "cell", "range"), "450");
    expect(updatePresenceSensor.mock.calls.map((call) => call[2])).toMatchObject([
      { name: "Entry cell", mode: "diffuse", range: 0.3 },
      { name: "Cell", mode: "through_beam" },
      { range: 0.45 },
    ]);
  });

  it("sends nothing for a value that is not valid and says why", async () => {
    const updateBelt = vi.fn();
    const store = openStore({ updateBelt });
    await commitDeviceEdit(store, edit("belt", "feed", "width"), "0");
    expect(updateBelt).not.toHaveBeenCalled();
    expect(store.state.message).toMatchObject({ level: "error", key: "message.conveyorInvalid" });
  });

  it("ignores an object the document no longer holds", async () => {
    const updateGuide = vi.fn();
    const store = openStore({ updateGuide });
    await commitDeviceEdit(store, edit("guide", "ghost", "name"), "x");
    expect(updateGuide).not.toHaveBeenCalled();
    expect(store.state.message).toBeNull();
  });
});

describe("the Delete command on a selected phase 6 object", () => {
  it("calls the delete of its kind", () => {
    const deleteGuide = vi.fn(async () => pantin);
    const store = openStore({ deleteGuide });
    store.state = { ...store.state, selection: { kind: "guide", id: "side" } };
    runMenuCommand(store, "delete", () => undefined);
    expect(deleteGuide).toHaveBeenCalledWith("press", "side");
  });
});

describe("reading the tags", () => {
  it("reads them with the panel closed when the Pantin has presence sensors", async () => {
    const listTags = vi.fn(async () => ({ stepCount: 0, tags: [], drives: [] }));
    const store = openStore({ listTags });
    // "3d": the diagram, shown by default, would read too.
    store.state = { ...store.state, inspectorOpen: false, centralLayout: "3d" };
    await refreshTagValues(store);
    expect(listTags).toHaveBeenCalledOnce();
  });
});
