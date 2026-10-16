import type { BridgeStatus } from "@pantin/protocol";
import type { MessageKey } from "../i18n/translate.ts";

// What one simulated module is doing, from the bridge status (ADR 0050): shown
// the same way in the bridge block and in the module list of the I/O view.

export type ModuleConnection = "stopped" | "waiting" | "connected";

// Colour of a status dot; the stylesheet owns the colours.
export type StatusTone = "idle" | "busy" | "ok" | "error";

export const MODULE_CONNECTION_KEYS: Readonly<Record<ModuleConnection, MessageKey>> = {
  stopped: "bridge.module.stopped",
  waiting: "bridge.module.waiting",
  connected: "bridge.module.connected",
};

const MODULE_CONNECTION_TONES: Readonly<Record<ModuleConnection, StatusTone>> = {
  stopped: "idle",
  waiting: "busy",
  connected: "ok",
};

export function moduleConnectionTone(connection: ModuleConnection): StatusTone {
  return MODULE_CONNECTION_TONES[connection];
}

/**
 * The status of the module with this key. The core lists modules only while the
 * bridge runs: any other state, a missing status or an unknown key reads as stopped.
 */
export function moduleConnection(status: BridgeStatus | null, key: string): ModuleConnection {
  if (status === null || status.state !== "running") {
    return "stopped";
  }
  const module = status.modules.find((candidate) => candidate.key === key);
  if (module === undefined) {
    return "stopped";
  }
  return module.plcConnected ? "connected" : "waiting";
}
