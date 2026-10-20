import { describe, expect, it, vi } from "vitest";
import { meshLoadMessage } from "../messages.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";

// "Retry" on the mesh load error loads the failed bodies again and clears the message.

describe("the retry intent of a mesh load error", () => {
  it("asks the viewport to load the failed bodies again and dismisses the message", () => {
    const retryFailedBodies = vi.fn();
    const store = testStore({}, { retryFailedBodies });
    store.update({ ...store.state, message: meshLoadMessage("Rail", "network error") });
    createPanelIntents(store).retryMeshLoad();
    expect(retryFailedBodies).toHaveBeenCalledTimes(1);
    expect(store.state.message).toBeNull();
  });
});
