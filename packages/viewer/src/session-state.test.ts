import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n/translate.ts";
import { buildPromptView } from "./panel/prompt-model.ts";
import {
  viewModeOf,
  withBodyDeleted,
  withCloseCancelled,
  withCloseRequested,
  withDeleteCancelled,
  withDeleteRequested,
  withEditsDiscarded,
  withJointDeleted,
  withListSelection,
  withPantinClosed,
  withWelcomeFilter,
  withWelcomeHidden,
  withWelcomeShown,
  withWelcomeTab,
} from "./session-state.ts";
import {
  hingeJoint,
  pantinResponse,
  pantinSummaries,
  railBody,
  stepBody,
} from "./test-fixtures.ts";
import { bodyNodeId, jointNodeId, pantinNodeId, sourceNodeNodeId } from "./tree/node-ids.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "./viewer-state.ts";

const translate = createTranslator("fr");
const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };

function editing(unsavedChanges: boolean): ViewerState {
  return withOpenPantin(
    listing,
    pantinResponse(unsavedChanges, [railBody, stepBody("carriage", "N_1")]),
  );
}

describe("list and edit views", () => {
  it("starts in the list view", () => {
    expect(viewModeOf(listing)).toBe("list");
  });

  it("enters the edit view on the opened Pantin, expanded down to its bodies", () => {
    const state = editing(false);
    expect(viewModeOf(state)).toBe("edit");
    expect(state.selectedNodeId).toBe(pantinNodeId("press"));
  });

  it("selects only Pantins that exist in the list", () => {
    expect(withListSelection(listing, "robot").listSelectedPantinId).toBe("robot");
    expect(withListSelection(listing, "ghost").listSelectedPantinId).toBeNull();
  });

  it("goes back to the list with the closed Pantin highlighted, and nothing left open", () => {
    const closed = withPantinClosed({ ...editing(false), pendingDeleteBodyId: "rail" });
    expect(viewModeOf(closed)).toBe("list");
    expect(closed).toMatchObject({
      listSelectedPantinId: "press",
      selectedNodeId: null,
      pendingDeleteBodyId: null,
    });
    expect(closed.expandedNodeIds.size).toBe(0);
  });
});

describe("closing with unsaved changes", () => {
  it("closes at once when everything is saved", () => {
    expect(viewModeOf(withCloseRequested(editing(false)))).toBe("list");
  });

  it("asks first when there are unsaved changes, with the three choices", () => {
    const asking = withCloseRequested(editing(true));
    expect(viewModeOf(asking)).toBe("edit");
    expect(asking.closePrompt).toBe(true);
    expect(buildPromptView(asking, translate)?.actions.map((entry) => entry.label)).toEqual([
      "Enregistrer",
      "Ne pas enregistrer",
      "Annuler",
    ]);
  });

  it("stays in the edit view when the user cancels", () => {
    const cancelled = withCloseCancelled(withCloseRequested(editing(true)));
    expect(cancelled.closePrompt).toBe(false);
    expect(viewModeOf(cancelled)).toBe("edit");
    expect(buildPromptView(cancelled, translate)).toBeNull();
  });

  it("leaves the edit view once the core discarded the edits", () => {
    const asking = withCloseRequested(editing(true));
    const discarded = withEditsDiscarded(asking, pantinResponse(false));
    expect(viewModeOf(discarded)).toBe("list");
    expect(discarded).toMatchObject({ closePrompt: false, listSelectedPantinId: "press" });
  });

  it("keeps the prompt, and the edit view, while the discard runs or after it failed", () => {
    const asking = withCloseRequested(editing(true));
    const running = { ...asking, pendingRequestCount: 1 };
    expect(viewModeOf(running)).toBe("edit");
    expect(buildPromptView(running, translate)?.enabled).toBe(false);
    expect(buildPromptView(asking, translate)?.enabled).toBe(true);
  });

  it("does nothing in the list view", () => {
    expect(withCloseRequested(listing)).toBe(listing);
  });
});

describe("deleting a body", () => {
  it("asks to confirm, naming the body", () => {
    const asking = withDeleteRequested(editing(false), bodyNodeId("press", "carriage"));
    expect(asking.pendingDeleteBodyId).toBe("carriage");
    expect(buildPromptView(asking, translate)?.text).toBe("Supprimer le corps « N_1 » ?");
  });

  it("refuses anything that is not an existing body", () => {
    const state = editing(false);
    expect(withDeleteRequested(state, pantinNodeId("press")).pendingDeleteBodyId).toBeNull();
    expect(
      withDeleteRequested(state, sourceNodeNodeId("press", "rail", 0)).pendingDeleteBodyId,
    ).toBeNull();
    expect(withDeleteRequested(state, bodyNodeId("press", "ghost")).pendingDeleteBodyId).toBeNull();
  });

  it("forgets the request on cancel", () => {
    const asking = withDeleteRequested(editing(false), bodyNodeId("press", "rail"));
    expect(withDeleteCancelled(asking).pendingDeleteBodyId).toBeNull();
  });

  it("shows the core's answer: body gone, unsaved changes on, Pantin selected", () => {
    const asking = withDeleteRequested(editing(false), bodyNodeId("press", "rail"));
    const deleted = withBodyDeleted(
      asking,
      pantinResponse(true, [stepBody("carriage", "N_1")]),
      "Linear rail",
    );
    expect(deleted.openPantin?.document.bodies.map((body) => body.id)).toEqual(["carriage"]);
    expect(deleted.openPantin?.unsavedChanges).toBe(true);
    expect(deleted).toMatchObject({
      selectedNodeId: pantinNodeId("press"),
      pendingDeleteBodyId: null,
    });
    expect(deleted.message?.key).toBe("message.deleted");
  });

  it("disables the prompt buttons while the request runs", () => {
    const asking = withDeleteRequested(editing(false), bodyNodeId("press", "rail"));
    expect(buildPromptView({ ...asking, pendingRequestCount: 1 }, translate)?.enabled).toBe(false);
  });
});

describe("deleting a joint", () => {
  const withJoint = withOpenPantin(
    listing,
    pantinResponse(false, [railBody, stepBody("carriage", "N_1")], "press", [hingeJoint]),
  );

  it("asks to confirm, naming the joint, without touching the body request", () => {
    const asking = withDeleteRequested(withJoint, jointNodeId("press", "hinge"));
    expect(asking).toMatchObject({ pendingDeleteJointId: "hinge", pendingDeleteBodyId: null });
    expect(buildPromptView(asking, translate)?.text).toBe("Supprimer la liaison « Hinge » ?");
  });

  it("refuses a joint that does not exist", () => {
    expect(
      withDeleteRequested(withJoint, jointNodeId("press", "ghost")).pendingDeleteJointId,
    ).toBeNull();
  });

  it("forgets the request on cancel", () => {
    const asking = withDeleteRequested(withJoint, jointNodeId("press", "hinge"));
    expect(withDeleteCancelled(asking).pendingDeleteJointId).toBeNull();
  });

  it("shows the core's answer: joint gone, unsaved changes on, Pantin selected", () => {
    const asking = withDeleteRequested(withJoint, jointNodeId("press", "hinge"));
    const deleted = withJointDeleted(
      asking,
      pantinResponse(true, [railBody, stepBody("carriage", "N_1")]),
      "Hinge",
    );
    expect(deleted.openPantin?.document.joints).toEqual([]);
    expect(deleted.openPantin?.unsavedChanges).toBe(true);
    expect(deleted).toMatchObject({
      selectedNodeId: pantinNodeId("press"),
      pendingDeleteJointId: null,
    });
    expect(deleted.message?.key).toBe("message.jointDeleted");
  });
});

describe("welcome dialog state (ADR 0027)", () => {
  it("hides, dropping a half-typed Pantin name, and shows again on the asked tab", () => {
    const hidden = withWelcomeHidden({ ...listing, creatingPantin: true });
    expect(hidden).toMatchObject({ welcomeHidden: true, creatingPantin: false });
    expect(withWelcomeShown(hidden, "all")).toMatchObject({
      welcomeHidden: false,
      welcomeTab: "all",
    });
    expect(withWelcomeShown({ ...hidden, welcomeTab: "all" }).welcomeTab).toBe("all");
  });

  it("keeps the tab and the filter", () => {
    const state = withWelcomeFilter(withWelcomeTab(listing, "all"), "rob");
    expect(state).toMatchObject({ welcomeTab: "all", welcomeFilter: "rob" });
  });

  it("comes back when a Pantin is closed", () => {
    const closed = withPantinClosed({ ...editing(false), welcomeHidden: true });
    expect(closed.welcomeHidden).toBe(false);
  });
});
