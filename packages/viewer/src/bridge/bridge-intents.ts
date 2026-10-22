import type { JournalLevel } from "./bridge-log-parser.ts";

// What the bridge block asks of the controller (ADR 0050 point 8). Texts arrive
// raw, as typed or chosen; the core is the one that validates them.
export interface BridgeIntents {
  // Start, or restart after a failure, with the network shown in the bar.
  startBridge(): void;
  stopBridge(): void;
  // "local" or "lan".
  chooseBridgeNetwork(mode: string): void;
  chooseBridgeListen(address: string): void;
  editBridgeAllow(text: string): void;
  // The OPC UA card (ADR 0065 point 13). The passwords are the ones typed in the card, by module
  // key; they go into the start request and nowhere else.
  startOpcuaBridge(passwords: Readonly<Record<string, string>>): void;
  // Restarts with the PLC certificate the user looked at (its SHA-256) pinned as trusted.
  trustAndRestartOpcuaBridge(sha256: string, passwords: Readonly<Record<string, string>>): void;
  stopOpcuaBridge(): void;
  editOpcuaTarget(moduleKey: string, text: string): void;
  // The log window (ADR 0054 point 5).
  openBridgeJournal(): void;
  closeBridgeJournal(): void;
  toggleBridgeJournalLevel(level: JournalLevel): void;
}
