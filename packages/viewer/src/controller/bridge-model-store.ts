import type { BridgeModel } from "../bridge/bridge-model.ts";
import { showBridgeCards } from "./bridge-cards.ts";
import type { ViewerStore } from "./viewer-store.ts";

/** The cards show the new model in place; they are the only readers of the typed fields. */
export function setBridgeModel(store: ViewerStore, next: BridgeModel): void {
  store.bridgeModel = next;
  showBridgeCards(store.ports, next, store.state);
  // The I/O view's module list shows each module's connection.
  store.renderPanel();
}
