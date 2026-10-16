import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildMenuBar, type MenuCommand } from "./menu-model.ts";

// "Relâcher tous les tags forcés" in the Edit menu (ADR 0045 point 5).

const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };
const editing = withOpenPantin(listing, pantinResponse(false));

function enabledCommands(state: ViewerState): MenuCommand[] {
  return buildMenuBar(state, createTranslator("fr"))
    .flatMap((menu) => menu.entries)
    .flatMap((entry) => (entry.type === "item" && entry.enabled ? [entry.command] : []));
}

describe("releasing the forced tags", () => {
  it("is in the Edit menu while a Pantin is open", () => {
    expect(enabledCommands(listing)).not.toContain("releaseAllTags");
    expect(enabledCommands(editing)).toContain("releaseAllTags");
  });

  it("waits for a request in flight, like the reset", () => {
    const busy = { ...editing, pendingRequestCount: 1 };
    expect(enabledCommands(busy)).not.toContain("releaseAllTags");
  });
});
