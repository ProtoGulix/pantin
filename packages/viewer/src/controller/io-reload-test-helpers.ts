import type { IoMappingResponse } from "@pantin/protocol";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";

// A store with a Pantin open over a fake I/O API, for the I/O reload tests.

const module = (key: string) => ({
  key,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels: [],
});
export const answer = (key: string): IoMappingResponse => ({
  status: "valid",
  mappingId: "id",
  modules: [module(key)],
  problems: [],
  unmappedTags: [],
});

export const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function ioStore(api: Parameters<typeof testStore>[0], layout: "io" | "3d" = "io") {
  const store = testStore({
    getPantin: async () => ({ ...pantin }),
    listPantins: async () => [],
    ...api,
  });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), centralLayout: layout });
  await settle();
  return store;
}
