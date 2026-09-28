import type { Body, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "./api-client.ts";
import { buildBodyRowView, buildPanelView, describeFailure } from "./view-model.ts";
import {
  INITIAL_VIEWER_STATE,
  type ViewerState,
  withImportedBodies,
  withImportFailed,
  withImportStarted,
  withOpenPantin,
  withRequestFinished,
  withRequestStarted,
  withSelectedBody,
} from "./viewer-state.ts";

const rail: Body = {
  id: "rail",
  name: "Linear rail",
  source: {
    fileName: "3630.glb",
    format: "glb",
    unit: "m",
    upAxis: "z",
    nodes: [
      { name: "3630.00.0800N_0", path: [0, 0] },
      { name: "", path: [0, 1] },
    ],
  },
  mesh: "meshes/rail.glb",
};

function pantinResponse(unsavedChanges: boolean, bodies: Body[] = [rail]): PantinResponse {
  return { id: "press", unsavedChanges, document: { schema_version: 1, name: "Press", bodies } };
}

function stateWith(openPantin: PantinResponse): ViewerState {
  return withOpenPantin(
    { ...INITIAL_VIEWER_STATE, pantins: [{ id: "press", name: "Press", bodyCount: 1 }] },
    openPantin,
  );
}

describe("unsaved indicator and save button", () => {
  it("shows the indicator and enables save when the core reports unsaved changes", () => {
    const view = buildPanelView(stateWith(pantinResponse(true)));
    expect(view.openPantin).toMatchObject({ hasUnsavedChanges: true, saveEnabled: true });
  });

  it("hides the indicator and disables save when everything is saved", () => {
    const view = buildPanelView(stateWith(pantinResponse(false)));
    expect(view.openPantin).toMatchObject({ hasUnsavedChanges: false, saveEnabled: false });
  });

  it("disables save while a request is in flight", () => {
    const busyState = withRequestStarted(stateWith(pantinResponse(true)));
    expect(buildPanelView(busyState).openPantin?.saveEnabled).toBe(false);
    expect(buildPanelView(withRequestFinished(busyState)).openPantin?.saveEnabled).toBe(true);
  });
});

describe("body list view", () => {
  it("shows the editable display name and the original source node names apart", () => {
    const row = buildBodyRowView(rail, null);
    expect(row.displayName).toBe("Linear rail");
    expect(row.sourceFileName).toBe("3630.glb");
    expect(row.sourceNodes).toEqual([
      { label: "3630.00.0800N_0", pathLabel: "0 / 0" },
      { label: "(unnamed node)", pathLabel: "0 / 1" },
    ]);
  });

  it("labels source format, unit and up axis", () => {
    const row = buildBodyRowView(rail, null);
    expect(row.sourceFormatLabel).toBe("GLB");
    expect(row.unitLabel).toBe("m (metres)");
    expect(row.upAxisLabel).toBe("Z up (CAD)");
  });

  it("marks the selected body", () => {
    expect(buildBodyRowView(rail, "rail").isSelected).toBe(true);
    expect(buildBodyRowView(rail, "other").isSelected).toBe(false);
  });

  it("explains how to add a body when there is none", () => {
    const view = buildPanelView(stateWith(pantinResponse(false, [])));
    expect(view.openPantin?.emptyBodiesMessage).toContain("Import");
  });
});

describe("Pantin list view", () => {
  it("marks the open Pantin and counts bodies", () => {
    const view = buildPanelView(stateWith(pantinResponse(false)));
    expect(view.pantins).toEqual([
      { id: "press", name: "Press", bodyCountLabel: "1 body", isOpen: true },
    ]);
    expect(view.emptyListMessage).toBeNull();
  });

  it("invites to create a Pantin when the list is empty", () => {
    expect(buildPanelView(INITIAL_VIEWER_STATE).emptyListMessage).not.toBeNull();
  });
});

describe("selection", () => {
  it("keeps the selection when the same Pantin is refreshed", () => {
    const selected = withSelectedBody(stateWith(pantinResponse(false)), "rail");
    expect(withOpenPantin(selected, pantinResponse(true)).selectedBodyId).toBe("rail");
  });

  it("drops the selection when the body is gone", () => {
    const selected = withSelectedBody(stateWith(pantinResponse(false)), "rail");
    expect(withOpenPantin(selected, pantinResponse(false, [])).selectedBodyId).toBeNull();
  });

  it("ignores a selection of an unknown body", () => {
    expect(withSelectedBody(stateWith(pantinResponse(false)), "ghost").selectedBodyId).toBeNull();
  });
});

describe("describeFailure", () => {
  it("shows the core's own message for an API error", () => {
    const error = new PantinApiError("api", "Name already used.", "conflict", 409);
    expect(describeFailure(error)).toBe("Name already used.");
  });

  it("flags a contract break", () => {
    const error = new PantinApiError("invalid_response", "Bad body.", null, 200);
    expect(describeFailure(error)).toBe("The core sent an unexpected answer. Bad body.");
  });

  it("never hides an unexpected error", () => {
    expect(describeFailure(new Error("boom"))).toBe("Unexpected error: boom");
  });
});

const stepComponent = (id: string, nodeName: string): Body => ({
  id,
  name: nodeName,
  source: {
    fileName: "3630.step",
    format: "step",
    unit: "m",
    upAxis: "z",
    nodes: [{ name: nodeName, path: [0] }],
  },
  mesh: `meshes/${id}.glb`,
});

describe("STEP bodies", () => {
  it("shows the STEP format and keeps the original node names", () => {
    const row = buildBodyRowView(stepComponent("carriage", "3630.00.0800N_1"), null);
    expect(row.sourceFormatLabel).toBe("STEP");
    expect(row.sourceNodes).toEqual([{ label: "3630.00.0800N_1", pathLabel: "0" }]);
  });
});

describe("import state", () => {
  const importing = (state: ViewerState): ViewerState =>
    withImportStarted({
      ...state,
      pendingImport: { fileName: "3630.step", format: "step", unit: "m", upAxis: "z" },
    });

  it("shows a conversion message and blocks a second submission during a STEP import", () => {
    const form = buildPanelView(importing(stateWith(pantinResponse(false)))).importForm;
    expect(form?.progressMessage).toContain("Converting the STEP file");
    expect(form?.canSubmit).toBe(false);
    expect(form?.showUnit).toBe(false);
  });

  it("closes the form and selects the first of several imported bodies", () => {
    const bodies = [stepComponent("rail", "3630_0"), stepComponent("carriage", "3630_1")];
    const refreshed = withOpenPantin(importing(stateWith(pantinResponse(false))), {
      ...pantinResponse(true, bodies),
    });
    const done = withImportedBodies(refreshed, bodies);
    expect(done).toMatchObject({
      importInProgress: false,
      pendingImport: null,
      selectedBodyId: "rail",
    });
    expect(buildPanelView(done).openPantin?.bodies.map((row) => row.id)).toEqual([
      "rail",
      "carriage",
    ]);
  });

  it("keeps the form open, ready to retry, after a failed import", () => {
    const failed = withImportFailed(importing(stateWith(pantinResponse(false))));
    const form = buildPanelView(failed).importForm;
    expect(form).toMatchObject({ progressMessage: null, canSubmit: true, fileName: "3630.step" });
  });
});

describe("describeFailure for STEP conversion", () => {
  it("explains how to enable STEP import when the converter is missing", () => {
    const error = new PantinApiError(
      "api",
      "No converter configured.",
      "conversion_unavailable",
      503,
    );
    const message = describeFailure(error);
    expect(message).toContain("No converter configured.");
    expect(message).toContain("--step-converter-python");
  });

  it("keeps the core's reason and suggests a way out when the conversion fails", () => {
    const error = new PantinApiError("api", "The file has no solid.", "conversion_failed", 422);
    const message = describeFailure(error);
    expect(message).toContain("The file has no solid.");
    expect(message).toContain("GLB or STL");
  });
});
