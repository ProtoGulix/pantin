import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildMenuBar } from "./menu-model.ts";

const translate = createTranslator("fr");
const listing = { ...initialViewerState("fr"), pantins: pantinSummaries };

describe("Help menu", () => {
  it("ends with Aide, always enabled, holding Documentation and À propos", () => {
    for (const state of [listing, withOpenPantin(listing, pantinResponse(false))]) {
      const help = buildMenuBar(state, translate).at(-1);
      expect(help?.label).toBe("Aide");
      expect(help?.entries).toEqual([
        expect.objectContaining({
          command: "documentation",
          label: "Documentation",
          enabled: true,
        }),
        expect.objectContaining({ command: "about", label: "À propos de Pantin…", enabled: true }),
      ]);
    }
  });
});
