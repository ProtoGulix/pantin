import type { AssemblyDeletion } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { withAssemblyDeleteRequested } from "../session-state.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { assemblyDeletionDetails } from "./assembly-deletion-details.ts";
import { buildPromptView } from "./prompt-model.ts";

// The prompt of an assembly deletion (ADR 0037 point 7): names, never ids.

const t = createTranslator("fr");
const deletion: AssemblyDeletion = {
  assembly: { key: "main", name: "Pince" },
  bodies: [{ id: "body-id-1", name: "Doigt" }],
  joints: [
    { id: "joint-id-1", name: "Fixation", betweenAssemblies: false },
    { id: "joint-id-2", name: "Chape", betweenAssemblies: true },
  ],
  drives: [{ id: "drive-id-1", name: "Distributeur" }],
  actuators: [{ id: "act-id-1", name: "Vérin" }],
  sensors: [{ id: "sen-id-1", name: "Capteur" }],
  reanchoredAssemblies: [{ key: "y", name: "Chariot" }],
  removedTags: ["pince.fixation.setpoint"],
  addedTags: ["chariot.tige.setpoint"],
};

describe("assemblyDeletionDetails", () => {
  it("has one line per non-empty group and one per re-anchored assembly, with no id", () => {
    const lines = assemblyDeletionDetails(deletion, t);
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe("Corps (1) : Doigt");
    expect(lines[2]).toContain("Chape");
    expect(lines.at(-1)).toBe(
      "L'assemblage « Chariot » reste en place, n'est plus rattaché à « Pince ».",
    );
    expect(lines.join("\n")).not.toMatch(/-id-/);
  });

  it("leaves out empty groups", () => {
    const lines = assemblyDeletionDetails(
      { ...deletion, joints: [], drives: [], actuators: [], sensors: [], reanchoredAssemblies: [] },
      t,
    );
    expect(lines).toEqual([
      "Corps (1) : Doigt",
      "Tags supprimés (1) : pince.fixation.setpoint",
      "Tags ajoutés (1) : chariot.tige.setpoint",
    ]);
  });

  it("feeds the prompt view with the question and the details", () => {
    const state = withAssemblyDeleteRequested(
      withOpenPantin(initialViewerState("fr"), pantinResponse(false)),
      deletion,
    );
    const view = buildPromptView(state, t);
    expect(view?.text).toBe("Supprimer l'assemblage « Pince » et tout son contenu ?");
    expect(view?.details).toEqual(assemblyDeletionDetails(deletion, t));
    expect(view?.actions.map((entry) => entry.action)).toEqual(["confirmDelete", "cancelDelete"]);
  });
});
