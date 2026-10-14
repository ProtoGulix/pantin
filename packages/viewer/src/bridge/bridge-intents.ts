// What the bridge bar asks of the controller (ADR 0050 point 8). Texts arrive
// raw, as typed or chosen; the core is the one that validates them.
export interface BridgeIntents {
  // Start, or restart after a failure, with the network shown in the bar.
  startBridge(): void;
  stopBridge(): void;
  // "local" or "lan".
  chooseBridgeNetwork(mode: string): void;
  chooseBridgeListen(address: string): void;
  editBridgeAllow(text: string): void;
}
