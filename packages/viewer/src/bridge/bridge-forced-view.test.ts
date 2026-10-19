import { describe, expect, it } from "vitest";
import { layoutOf } from "../central-layout.ts";
import { createTranslator } from "../i18n/translate.ts";
import { bridgeStatusOf, RUNNING_STATUS } from "./bridge-fixtures.ts";
import { type BridgeModel, bridgeAfterStatus, INITIAL_BRIDGE_MODEL } from "./bridge-model.ts";
import { bridgeRedrawKey, buildBridgeView } from "./bridge-view.ts";

const fr = createTranslator("fr");

function modelOf(status: Parameters<typeof bridgeAfterStatus>[1]): BridgeModel {
  return bridgeAfterStatus(INITIAL_BRIDGE_MODEL, status);
}

describe("the forced tags warning", () => {
  const withForced = (status: Parameters<typeof bridgeAfterStatus>[1], count: number) =>
    buildBridgeView(modelOf(status), fr, layoutOf("3d"), [], count)?.forcedWarning ?? null;

  it("is shown while the bridge runs and a tag is forced", () => {
    expect(withForced(RUNNING_STATUS, 2)).toEqual({
      text: "2 tag(s) forcé(s) : l'automate ne peut pas les écrire",
      releaseLabel: "Relâcher tout (2)",
      releaseHint: expect.stringContaining("automate"),
    });
  });

  it("is absent with no forced tag, or while the bridge does not run", () => {
    expect(withForced(RUNNING_STATUS, 0)).toBeNull();
    expect(withForced(bridgeStatusOf(), 2)).toBeNull();
  });

  it("redraws the block when the count changes", () => {
    const keyOf = (count: number) => {
      const view = buildBridgeView(modelOf(RUNNING_STATUS), fr, layoutOf("3d"), [], count);
      return view === null ? "" : bridgeRedrawKey(view);
    };
    expect(keyOf(1)).not.toBe(keyOf(2));
  });
});
