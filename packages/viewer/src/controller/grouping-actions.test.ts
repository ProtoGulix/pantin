import type { GroupBodiesResponse, PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { withGroupNameEdited } from "../grouping/grouping-state.ts";
import { createTranslator } from "../i18n/translate.ts";
import { menuContext } from "../menu/menu-context.ts";
import { buildContextMenuView } from "../panel/context-menu-model.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { selectedNodeIdOf, selectedNodeIdsOf } from "../selection.ts";
import { pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { commitKeyEdit } from "./assembly-actions.ts";
import { testStore } from "./controller-test-helpers.ts";
import { cancelGroup, confirmGroup, requestGroup, ungroupSelection } from "./grouping-actions.ts";
import { resolvePrompt } from "./session-actions.ts";
import { openContextMenu, selectRows } from "./tree-actions.ts";

// Grouper… and Dégrouper from the tree selection (ADR 0055 point 12).

const translate = createTranslator("fr");
const base = pantinResponse(true, [railBody, stepBody("rod", "Tige"), stepBody("head", "Tête")]);
const pantin: PantinResponse = {
  ...base,
  document: {
    ...base.document,
    assemblies: [
      ...base.document.assemblies,
      {
        key: "cap",
        name: "Capot",
        parent: "main",
        placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      },
    ],
  },
};
const rail = bodyNodeId("press", "rail");
const rod = bodyNodeId("press", "rod");
const head = bodyNodeId("press", "head");
const cap = assemblyNodeId("press", "cap");

function openStore(api: Parameters<typeof testStore>[0] = {}) {
  const store = testStore({ getPantin: async () => pantin, listPantins: async () => [], ...api });
  store.requestedPantinId = "press";
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const groupAnswer: GroupBodiesResponse = {
  pantin,
  group: { key: "rod_group", name: "Tige groupée" },
  deletedJoints: [{ id: "weld", name: "Soudure" }],
  renamedTags: [{ from: "main.rod.setpoint", to: "rod_group.rod.setpoint" }],
};

describe("tree multi-selection", () => {
  it("keeps the first row as the selection and the others with it", () => {
    const store = openStore();
    selectRows(store, [rod, head, rail]);
    expect(selectedNodeIdOf(store.state.selection)).toBe(rod);
    expect(selectedNodeIdsOf(store.state.selection, store.state.multiSelectedNodeIds)).toEqual([
      rod,
      head,
      rail,
    ]);
  });

  it("ends with any other selection", () => {
    const store = openStore();
    selectRows(store, [rod, head]);
    store.update({ ...store.state, selection: { kind: "node", nodeId: head } });
    expect(selectedNodeIdsOf(store.state.selection, store.state.multiSelectedNodeIds)).toEqual([
      head,
    ]);
  });

  it("keeps it for the context menu of a selected row, and drops it for another row", () => {
    const store = openStore();
    selectRows(store, [rod, head]);
    openContextMenu(store, head, 1, 2);
    expect(store.state.multiSelectedNodeIds).toEqual([rod, head]);
    expect(store.state.contextMenu?.nodeId).toBe(head);
    openContextMenu(store, rail, 1, 2);
    expect(store.state.multiSelectedNodeIds).toEqual([]);
  });

  it("enables Grouper… and Dégrouper by the selected rows", () => {
    const store = openStore();
    selectRows(store, [rod, head]);
    expect(menuContext(store.state)).toMatchObject({ canGroup: true, canUngroup: false });
    selectRows(store, [cap]);
    expect(menuContext(store.state)).toMatchObject({ canGroup: true, canUngroup: true });
    selectRows(store, [assemblyNodeId("press", "main")]);
    expect(menuContext(store.state)).toMatchObject({ canGroup: false, canUngroup: false });
  });

  it("offers grouping in the context menu on the selection", () => {
    const store = openStore();
    selectRows(store, [rod, head]);
    openContextMenu(store, rod, 1, 2);
    const actions = buildContextMenuView(store.state, translate)?.entries.map((e) => e.action);
    expect(actions).toContain("group");
    expect(actions).not.toContain("ungroup");
  });
});

describe("Grouper…", () => {
  it("asks for a name over the selected rows and cancels cleanly", () => {
    const store = openStore();
    selectRows(store, [rod, head]);
    requestGroup(store);
    const view = buildPromptView(store.state, translate);
    expect(view?.text).toContain("Grouper 2 éléments");
    expect(view?.textField?.value).toBe("Groupe");
    cancelGroup(store);
    expect(store.state.pendingGroup).toBeNull();
  });

  it("asks nothing when the rows cannot be grouped", () => {
    const store = openStore();
    selectRows(store, [assemblyNodeId("press", "main")]);
    requestGroup(store);
    expect(store.state.pendingGroup).toBeNull();
  });

  it("refuses to confirm a blank name", () => {
    const store = openStore();
    selectRows(store, [rod]);
    requestGroup(store);
    store.update(withGroupNameEdited(store.state, " "));
    expect(buildPromptView(store.state, translate)?.actions[0]?.disabled).toBe(true);
  });
});

describe("Grouper… confirmed", () => {
  it("sends the members, selects the new group and reports joints and tags", async () => {
    const groupBodies = vi.fn(async () => groupAnswer);
    const store = openStore({ groupBodies });
    selectRows(store, [rod, head]);
    requestGroup(store);
    resolvePrompt(store, "confirmGroup");
    await vi.waitFor(() => expect(store.state.message).not.toBeNull());
    expect(groupBodies).toHaveBeenCalledWith("press", "main", {
      name: "Groupe",
      bodies: ["rod", "head"],
      assemblies: [],
    });
    const message = store.state.message;
    const text = message === null ? "" : translate(message.key, message.parameters);
    expect(text).toContain("Soudure");
    expect(text).toContain("régénérez la GVL");
    expect(store.state.pendingGroup).toBeNull();
    expect(store.state.multiSelectedNodeIds).toEqual([]);
  });

  it("shows the core's sentence when it refuses", async () => {
    const sentence = 'Joint "Coulisse" moves "Tige": add it to the group.';
    const groupBodies = vi.fn(async () => {
      throw new PantinApiError("api", sentence, "conflict", 409);
    });
    const store = openStore({ groupBodies });
    selectRows(store, [rod]);
    requestGroup(store);
    await confirmGroup(store);
    const message = store.state.message;
    expect(message === null ? "" : translate(message.key, message.parameters)).toBe(sentence);
  });
});

describe("Dégrouper", () => {
  it("dissolves the selected group and selects its structure parent", async () => {
    const ungroupAssembly = vi.fn(async () => ({
      pantin,
      deletedJoints: [],
      renamedTags: [],
    }));
    const store = openStore({ ungroupAssembly });
    selectRows(store, [cap]);
    await ungroupSelection(store);
    expect(ungroupAssembly).toHaveBeenCalledWith("press", "cap");
    expect(selectedNodeIdOf(store.state.selection)).toBe(assemblyNodeId("press", "main"));
    expect(store.state.message?.level).toBe("info");
  });

  it("does nothing on a top-level assembly", async () => {
    const ungroupAssembly = vi.fn();
    const store = openStore({ ungroupAssembly });
    selectRows(store, [assemblyNodeId("press", "main")]);
    await ungroupSelection(store);
    expect(ungroupAssembly).not.toHaveBeenCalled();
  });
});

describe("a body move that deletes joints", () => {
  it("keeps the renamed tag count and asks to regenerate the GVL", async () => {
    const moveBody = vi.fn(async () => ({
      pantin,
      deletedJoints: [{ id: "weld", name: "Soudure" }],
      renamedTags: [{ from: "main.rod.setpoint", to: "cap.rod.setpoint" }],
    }));
    const store = openStore({ moveBody });
    await commitKeyEdit(store, { kind: "bodyAssembly", pantinId: "press", bodyId: "rod" }, "cap");
    const message = store.state.message;
    const text = message === null ? "" : translate(message.key, message.parameters);
    expect(text).toContain("Soudure");
    expect(text).toContain("1 tag renommé");
    expect(text).toContain("régénérez la GVL");
  });
});
