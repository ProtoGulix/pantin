import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { withExamplePromptToggled } from "../example-state.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { testStore } from "./controller-test-helpers.ts";
import { copyExample, exampleCopyFailureMessage, loadExamples } from "./example-actions.ts";

const axis = { id: "axis", name: "Axis", bodyCount: 2 };

function asking(api: Parameters<typeof testStore>[0]) {
  const store = testStore({ listPantins: async () => [], ...api });
  store.update(
    withExamplePromptToggled(
      { ...store.state, examples: { offered: [axis], copyingId: null } },
      "axis",
    ),
  );
  return store;
}

describe("loadExamples", () => {
  it("keeps the examples the core lists", async () => {
    const store = testStore({ listExamples: async () => [axis] });
    await loadExamples(store);
    expect(store.state.examples.offered).toEqual([axis]);
  });

  it("says so when the list cannot be read", async () => {
    const store = testStore({
      listExamples: async () => {
        throw new PantinApiError("network", "offline", null, null);
      },
    });
    await loadExamples(store);
    expect(store.state.examples.offered).toEqual([]);
    expect(store.state.message?.key).toBe("error.network");
  });
});

describe("copyExample", () => {
  it("copies under the typed name, opens the copy and closes the prompt", async () => {
    const copies: [string, string | undefined][] = [];
    const store = asking({
      copyExample: async (id, name): Promise<PantinResponse> => {
        copies.push([id, name]);
        return pantinResponse(false, [], "axis-2");
      },
    });
    expect(await copyExample(store, "My axis")).toBe(true);
    expect(copies).toEqual([["axis", "My axis"]]);
    expect(store.state.openPantin?.id).toBe("axis-2");
    expect(store.state.examples.copyingId).toBeNull();
  });

  it("does nothing when no example prompt is open", async () => {
    const store = testStore({});
    expect(await copyExample(store, "x")).toBe(false);
  });

  it("keeps the prompt open and says what to do when the core refuses", async () => {
    const store = asking({
      copyExample: async () => {
        throw new PantinApiError("api", "taken", "conflict", 409);
      },
    });
    expect(await copyExample(store, "Axis")).toBe(false);
    expect(store.state.examples.copyingId).toBe("axis");
    expect(store.state.openPantin).toBeNull();
    expect(store.state.message?.key).toBe("example.error.conflict");
  });
});

describe("exampleCopyFailureMessage", () => {
  it("words 404, 409 and network failures", () => {
    const failure = (error: PantinApiError) => exampleCopyFailureMessage(error).key;
    expect(failure(new PantinApiError("api", "x", "not_found", 404))).toBe(
      "example.error.notFound",
    );
    expect(failure(new PantinApiError("api", "x", "conflict", 409))).toBe("example.error.conflict");
    expect(failure(new PantinApiError("network", "x", null, null))).toBe("error.network");
  });
});
