import { describe, expect, it } from "vitest";
import { layoutOf } from "../central-layout.ts";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildMenuBar, type MenuCommand } from "./menu-model.ts";

const translate = createTranslator("fr");
const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };
const editing = withOpenPantin(listing, pantinResponse(false));

function enabledCommands(state: ViewerState): MenuCommand[] {
  return buildMenuBar(state, translate)
    .flatMap((menu) => menu.entries)
    .flatMap((entry) => (entry.type === "item" && entry.enabled ? [entry.command] : []));
}

describe("menu bar model zones", () => {
  const entriesOf = (state: ViewerState, prefix: string) =>
    buildMenuBar(state, translate)[2]
      ?.entries.filter((entry) => entry.type === "item" && entry.command.startsWith(prefix))
      .map((entry) => entry.type === "item" && [entry.command, entry.checked, entry.enabled]);

  it("checks the view of each zone and disables the one the other zone shows", () => {
    const state = { ...editing, centralLayout: layoutOf("diagram", "3d") };
    expect(entriesOf(state, "topView:")).toEqual([
      ["topView:3d", false, false],
      ["topView:diagram", true, true],
      ["topView:joints", false, true],
      ["topView:io", false, true],
    ]);
    expect(entriesOf(state, "bottomView:")).toEqual([
      ["bottomView:3d", true, true],
      ["bottomView:diagram", false, false],
      ["bottomView:joints", false, true],
      ["bottomView:io", false, true],
    ]);
  });

  it("opens the bottom zone only while it is closed, and closes it only while it is open", () => {
    const closed = { ...editing, centralLayout: layoutOf("3d") };
    expect(enabledCommands(closed)).toContain("openBottomZone");
    expect(enabledCommands(closed)).not.toContain("closeBottomZone");
    expect(enabledCommands(editing)).toContain("closeBottomZone");
    expect(enabledCommands(editing)).not.toContain("openBottomZone");
  });

  it("offers no view while no Pantin is open", () => {
    expect(enabledCommands(listing)).not.toContain("topView:3d");
  });
});
