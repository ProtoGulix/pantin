import { describe, expect, it } from "vitest";
import {
  exampleBeingCopied,
  withCreatePromptToggled,
  withExamplePromptToggled,
  withExamplesListed,
} from "./example-state.ts";
import { withWelcomeHidden } from "./session-state.ts";
import { initialViewerState } from "./viewer-state.ts";

const axis = { id: "axis", name: "Axis", bodyCount: 2 };
const start = withExamplesListed(initialViewerState("en"), [axis]);

describe("name prompt state (ADR 0062)", () => {
  it("opens one prompt at a time", () => {
    const asking = withExamplePromptToggled(start, "axis");
    expect(asking).toMatchObject({ examples: { copyingId: "axis" }, creatingPantin: false });
    expect(withCreatePromptToggled(asking)).toMatchObject({
      examples: { copyingId: null },
      creatingPantin: true,
    });
    expect(withExamplePromptToggled(withCreatePromptToggled(start), "axis")).toMatchObject({
      examples: { copyingId: "axis" },
      creatingPantin: false,
    });
  });

  it("closes the example prompt on a second click and when the dialog is hidden", () => {
    const asking = withExamplePromptToggled(start, "axis");
    expect(withExamplePromptToggled(asking, "axis").examples.copyingId).toBeNull();
    expect(withWelcomeHidden(asking).examples.copyingId).toBeNull();
  });

  it("finds the example being copied", () => {
    expect(exampleBeingCopied(start)).toBeUndefined();
    expect(exampleBeingCopied(withExamplePromptToggled(start, "axis"))).toEqual(axis);
  });
});
