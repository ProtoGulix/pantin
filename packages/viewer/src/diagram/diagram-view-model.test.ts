import { describe, expect, it } from "vitest";
import { nodeSelection } from "../selection.ts";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId } from "../tree/node-ids.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { createChainLinksCache } from "./diagram-chains.ts";
import { createDiagramModelBuilder } from "./diagram-view-model.ts";

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);
const base = {
  ...withOpenPantin(initialViewerState("fr"), pantin),
  centralLayout: "both" as const,
};

function shown(model: ReturnType<ReturnType<typeof createDiagramModelBuilder>>) {
  if (!model.shown) {
    throw new Error("The diagram should be shown.");
  }
  return model;
}

describe("createDiagramModelBuilder", () => {
  it("is shown in the diagram and both layouts, not in 3D alone or with no Pantin", () => {
    const build = createDiagramModelBuilder(createChainLinksCache());
    expect(build({ ...base, centralLayout: "diagram" }).shown).toBe(true);
    expect(build({ ...base, centralLayout: "3d" }).shown).toBe(false);
    expect(build({ ...base, openPantin: null }).shown).toBe(false);
  });

  it("returns the same diagram while only the selection changes", () => {
    const build = createDiagramModelBuilder(createChainLinksCache());
    const first = shown(build(base));
    const selected = shown(
      build({ ...base, selection: nodeSelection(bodyNodeId(pantin.id, "carriage")) }),
    );
    expect(selected.diagram).toBe(first.diagram);
    expect(selected.typeLabels).toBe(first.typeLabels);
  });

  it("returns a new diagram when the document, the collapsed bands or the language change", () => {
    const build = createDiagramModelBuilder(createChainLinksCache());
    const first = shown(build(base)).diagram;
    const newDocument = { ...pantin, document: { ...pantin.document } };
    expect(shown(build({ ...base, openPantin: newDocument })).diagram).not.toBe(first);
    const second = shown(build({ ...base, openPantin: newDocument })).diagram;
    expect(
      shown(build({ ...base, openPantin: newDocument, collapsedDiagramBands: new Set(["x"]) }))
        .diagram,
    ).not.toBe(second);
    const third = shown(
      build({ ...base, openPantin: newDocument, collapsedDiagramBands: new Set(["x"]) }),
    ).diagram;
    expect(
      shown(
        build({
          ...base,
          openPantin: newDocument,
          collapsedDiagramBands: new Set(["x"]),
          language: "en",
        }),
      ).diagram,
    ).not.toBe(third);
  });
});
