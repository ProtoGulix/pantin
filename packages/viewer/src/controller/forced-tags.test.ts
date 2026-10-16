import type { Tag } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { refreshTagValues, releaseAllTags, releaseTag } from "./drive-commands.ts";
import { forcedTagNames } from "./tag-read.ts";

// The tags a client forced are read with the values, shown, and given back (ADR 0045 point 5).

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);

function tagOf(name: string, forced: boolean): Tag {
  return { name, type: "bit", direction: "command", value: 1, forced };
}

function answerOf(forcedNames: readonly string[]) {
  const tags = ["a.v.coil_14", "a.v.coil_12"].map((name) =>
    tagOf(name, forcedNames.includes(name)),
  );
  return { stepCount: 0, tags, drives: [] };
}

describe("forcedTagNames", () => {
  it("keeps the names of the forced tags only", () => {
    const tags = [tagOf("a.v.coil_14", true), tagOf("a.v.coil_12", false)];
    expect([...forcedTagNames(tags)]).toEqual(["a.v.coil_14"]);
  });
});

describe("the forced tags of a tag read", () => {
  it("reaches the live ports and the transport bar, and is forgotten with the Pantin", async () => {
    const showInspectorLive = vi.fn();
    const showClock = vi.fn();
    const store = testStore({ listTags: async () => answerOf(["a.v.coil_14"]) }, {}, undefined, {
      showInspectorLive,
      showClock,
    });
    store.requestedPantinId = pantin.id;
    store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: true });
    await refreshTagValues(store);
    expect(showInspectorLive.mock.lastCall?.[2]).toEqual(new Set(["a.v.coil_14"]));
    expect(showClock.mock.lastCall?.[0].releaseAll?.label).toBe("Relâcher tout (1)");
    store.update({ ...store.state, openPantin: null });
    expect(store.forcedTags.size).toBe(0);
  });

  it("keeps reading while a tag is forced, even with nothing to show", async () => {
    const listTags = vi.fn(async () => answerOf(["a.v.coil_14"]));
    const store = testStore({ listTags });
    store.requestedPantinId = pantin.id;
    store.update({
      ...withOpenPantin(store.state, pantin),
      inspectorOpen: false,
      centralLayout: "3d",
    });
    await refreshTagValues(store);
    expect(listTags).not.toHaveBeenCalled();
    await refreshTagValues(store, true);
    await refreshTagValues(store);
    expect(listTags).toHaveBeenCalledTimes(2);
  });
});

describe("releasing forced tags", () => {
  it("releases one tag, then reads the tags again", async () => {
    const releaseTagRoute = vi.fn(async () => tagOf("a.v.coil_14", false));
    const listTags = vi.fn(async () => answerOf([]));
    const store = testStore({ releaseTag: releaseTagRoute, listTags });
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    await releaseTag(store, "a.v.coil_14");
    expect(releaseTagRoute).toHaveBeenCalledWith(pantin.id, "a.v.coil_14");
    expect(listTags).toHaveBeenCalledOnce();
  });

  it("releases every tag, and the bar loses its button", async () => {
    const showClock = vi.fn();
    let forced = ["a.v.coil_14"];
    const store = testStore(
      {
        releaseAllTags: async () => {
          forced = [];
          return answerOf([]);
        },
        listTags: async () => answerOf(forced),
      },
      {},
      undefined,
      { showClock },
    );
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    await refreshTagValues(store, true);
    expect(showClock.mock.lastCall?.[0].releaseAll).not.toBeNull();
    await releaseAllTags(store);
    expect(showClock.mock.lastCall?.[0].releaseAll).toBeNull();
  });
});
