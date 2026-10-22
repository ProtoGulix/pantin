import type { BridgeModel } from "../bridge/bridge-model.ts";
import { type BridgeView, bridgeViewOf } from "../bridge/bridge-view.ts";
import { type OpcuaBridgeView, opcuaViewOf } from "../bridge/opcua-view.ts";
import type { ViewerState } from "../viewer-state.ts";

// The bridge cards of the side panel, one per transport kind (ADR 0065 point 13): both are drawn
// from the same model whenever it, the state or the forced tags change.

export interface BridgeCardPorts {
  showBridge(view: BridgeView | null): void;
  showOpcuaBridge(view: OpcuaBridgeView | null): void;
}

export function showBridgeCards(
  ports: BridgeCardPorts,
  model: BridgeModel,
  state: ViewerState,
  forcedCount = 0,
): void {
  ports.showBridge(bridgeViewOf(model, state, forcedCount));
  ports.showOpcuaBridge(opcuaViewOf(model.opcua, state));
}
