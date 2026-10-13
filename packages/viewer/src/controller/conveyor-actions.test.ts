import type { CreateBeltRequest, CreateGuideRequest, PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { PantinApiError } from "../api-transport.ts";
import { cartonSource, conveyorPantin, feedBelt } from "../conveyors/conveyor-fixtures.ts";
import { selectedDeviceOf } from "../selection.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { selectConveyorFromViewport } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import {
  changeConveyorAssembly,
  changeConveyorBody,
  deleteConveyor,
  editConveyorField,
  openConveyorForm,
  resetSimulation,
  spawnProduct,
  submitConveyorForm,
} from "./conveyor-actions.ts";

// The phase 6 objects of the inspector (ADR 0043 point 13): the form, the
// delete command, "Créer un produit" and "Remise à zéro".

const pantin = conveyorPantin();

function openStore(api: Partial<PantinApiClient>, open: PantinResponse = pantin) {
  const store = testStore({ getPantin: async () => open, listPantins: async () => [], ...api });
  store.requestedPantinId = open.id;
  store.state = withOpenPantin(store.state, open);
  return store;
}

describe("the object form", () => {
  it("opens empty for a new object and filled for a stored one", () => {
    const store = openStore({});
    openConveyorForm(store, "guide", null);
    expect([store.state.conveyorForm?.kind, store.state.conveyorForm?.id]).toEqual(["guide", null]);
    expect(store.state.inspectorOpen).toBe(true);
    openConveyorForm(store, "belt", "feed");
    expect(store.state.conveyorForm).toMatchObject({ id: "feed", name: "Feed" });
    openConveyorForm(store, "belt", "ghost");
    expect(store.state.conveyorForm?.id).toBe("feed");
  });

  it("keeps the text typed, and a body only when the assembly has it", () => {
    const store = openStore({});
    openConveyorForm(store, "guide", null);
    editConveyorField(store, "name", "Rail");
    editConveyorField(store, "sizeX", "800");
    changeConveyorBody(store, "rail");
    changeConveyorBody(store, "elsewhere");
    expect(store.state.conveyorForm).toMatchObject({
      name: "Rail",
      body: "rail",
      values: { sizeX: "800" },
    });
    changeConveyorAssembly(store, "main");
    expect(store.state.conveyorForm?.body).toBe("rail");
  });
});

describe("creating from the form", () => {
  it("creates the object, selects it and closes the form", async () => {
    const createGuide = vi.fn(async (_id: string, request: CreateGuideRequest) => ({
      ...request,
      id: "rail",
    }));
    const store = openStore({ createGuide });
    openConveyorForm(store, "guide", null);
    editConveyorField(store, "name", "Rail");
    await submitConveyorForm(store);
    expect(createGuide).toHaveBeenCalledOnce();
    expect(createGuide.mock.calls[0]?.[1]).toMatchObject({ name: "Rail", size: [1, 0.02, 0.06] });
    expect(store.state.conveyorForm).toBeNull();
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "guide", id: "rail" });
    expect(store.state.message).toMatchObject({ level: "info", key: "message.guide.created" });
  });
});

describe("a slow list refresh after the form", () => {
  it("has already selected the object, so a click made meanwhile is not undone", async () => {
    let release: () => void = () => undefined;
    const listPantins = () =>
      new Promise<[]>((resolve) => {
        release = () => resolve([]);
      });
    const createGuide = async (_id: string, request: CreateGuideRequest) => ({
      ...request,
      id: "rail",
    });
    const store = openStore({ createGuide, listPantins });
    openConveyorForm(store, "guide", null);
    editConveyorField(store, "name", "Rail");
    const pending = submitConveyorForm(store);
    await vi.waitFor(() => expect(store.state.conveyorForm).toBeNull());
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "guide", id: "rail" });
    selectConveyorFromViewport(store, "belt", "feed");
    release();
    await pending;
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "belt", id: "feed" });
  });
});

describe("replacing from the form", () => {
  it("replaces a stored object through its update call", async () => {
    const updateBelt = vi.fn(async (_id: string, beltId: string, _request: CreateBeltRequest) => ({
      ...feedBelt,
      id: beltId,
    }));
    const store = openStore({ updateBelt });
    openConveyorForm(store, "belt", "feed");
    editConveyorField(store, "length", "2000");
    await submitConveyorForm(store);
    expect(updateBelt.mock.calls[0]?.[1]).toBe("feed");
    expect(updateBelt.mock.calls[0]?.[2]).toMatchObject({ length: 2 });
    expect(store.state.message?.key).toBe("message.belt.updated");
  });

  it("sends nothing for an invalid form and says which field is wrong", async () => {
    const createBelt = vi.fn();
    const store = openStore({ createBelt });
    openConveyorForm(store, "belt", null);
    await submitConveyorForm(store);
    expect(createBelt).not.toHaveBeenCalled();
    expect(store.state.message).toMatchObject({ level: "error", key: "message.conveyorInvalid" });
    expect(store.state.message?.detail).toBeTruthy();
    expect(store.state.conveyorForm).not.toBeNull();
  });

  it("shows the core's refusal with its message and keeps the form open", async () => {
    const refusal = new PantinApiError("api", "Body rail is in another assembly.", "conflict", 409);
    const store = openStore({
      createGuide: async () => {
        throw refusal;
      },
    });
    openConveyorForm(store, "guide", null);
    editConveyorField(store, "name", "Rail");
    await submitConveyorForm(store);
    expect(store.state.message).toMatchObject({
      level: "error",
      key: "error.code.conflict",
      detail: "Body rail is in another assembly.",
    });
    expect(store.state.conveyorForm?.name).toBe("Rail");
  });
});

describe("deleting an object", () => {
  it("calls the delete of its kind and says so", async () => {
    const deleteAbsorber = vi.fn(async () => pantin);
    const store = openStore({ deleteAbsorber });
    await deleteConveyor(store, "absorber", "sink");
    expect(deleteAbsorber).toHaveBeenCalledWith("press", "sink");
    expect(store.state.message?.key).toBe("message.absorber.deleted");
  });

  it("reports a drum or a frame still in use with the core's text", async () => {
    const refusal = new PantinApiError("api", "Belt feed turns on spin.", "conflict", 409);
    const store = openStore({
      deleteBelt: async () => {
        throw refusal;
      },
    });
    await deleteConveyor(store, "belt", "feed");
    expect(store.state.message).toMatchObject({
      level: "error",
      detail: "Belt feed turns on spin.",
    });
  });
});

describe("Créer un produit", () => {
  it("writes 0, 1 then 0 to the emitter's spawn tag, in that order", async () => {
    const writes: [string, number][] = [];
    const writeTag = vi.fn(async (_id: string, name: string, value: number) => {
      writes.push([name, value]);
      return { name, type: "bit" as const, direction: "command" as const, value };
    });
    const store = openStore({ writeTag });
    await spawnProduct(store, cartonSource.id);
    expect(writes).toEqual([
      ["main.source.spawn", 0],
      ["main.source.spawn", 1],
      ["main.source.spawn", 0],
    ]);
    expect(store.state.message).toMatchObject({ key: "message.productRequested" });
  });

  it("stops after a refused write and does nothing for an emitter that is gone", async () => {
    const writeTag = vi.fn(async () => {
      throw new PantinApiError("api", "No such tag.", "not_found", 404);
    });
    const store = openStore({ writeTag });
    await spawnProduct(store, "source");
    expect(writeTag).toHaveBeenCalledOnce();
    expect(store.state.message?.level).toBe("error");
    await spawnProduct(store, "ghost");
    expect(writeTag).toHaveBeenCalledOnce();
  });
});

describe("Créer un produit after a failed closing write", () => {
  it("still gives a rising edge on the next click", async () => {
    const writes: number[] = [];
    let refuseClosingZero = true;
    const writeTag = vi.fn(async (_id: string, name: string, value: number) => {
      if (refuseClosingZero && value === 0 && writes.at(-1) === 1) {
        refuseClosingZero = false;
        throw new PantinApiError("api", "Connection lost.", "internal_error", 500);
      }
      writes.push(value);
      return { name, type: "bit" as const, direction: "command" as const, value };
    });
    const store = openStore({ writeTag });
    await spawnProduct(store, cartonSource.id);
    expect(store.state.message?.level).toBe("error");
    expect(writes).toEqual([0, 1]);
    await spawnProduct(store, cartonSource.id);
    expect(writes).toEqual([0, 1, 0, 1, 0]);
    expect(store.state.message).toMatchObject({ key: "message.productRequested" });
  });
});

describe("Remise à zéro", () => {
  it("calls the reset route, shows the Pantin it answers and reads faults and tags again", async () => {
    const answered = { ...pantin, unsavedChanges: true };
    const resetPantin = vi.fn(async () => answered);
    const getFaults = vi.fn(async () => ({ jammedJoints: [], unresponsiveDrives: [] }));
    const listTags = vi.fn(async () => ({ stepCount: 0, tags: [], drives: [] }));
    const store = openStore({ resetPantin, getFaults, listTags });
    await resetSimulation(store);
    expect(resetPantin).toHaveBeenCalledWith("press");
    expect(store.state.openPantin?.unsavedChanges).toBe(true);
    expect(store.state.message?.key).toBe("message.simulationReset");
    expect(getFaults).toHaveBeenCalledOnce();
  });

  it("reports a failure and keeps what was on screen", async () => {
    const store = openStore({
      resetPantin: async () => {
        throw new PantinApiError("network", "down", null, null);
      },
    });
    await resetSimulation(store);
    expect(store.state.message?.level).toBe("error");
    expect(store.state.openPantin).toEqual(pantin);
  });
});

describe("a click on an object in the 3D view", () => {
  it("selects it and opens the inspector on it", () => {
    const store = openStore({});
    selectConveyorFromViewport(store, "emitter", "source");
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "emitter", id: "source" });
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("ignores an object the Pantin does not hold", () => {
    const store = openStore({});
    const before = store.state.selection;
    selectConveyorFromViewport(store, "belt", "ghost");
    expect(store.state.selection).toBe(before);
  });
});
