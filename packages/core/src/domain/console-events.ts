import type { DriveDiagnostic } from "@pantin/drive-types/schemas";
import {
  type ConsoleEvent,
  type ConsoleSource,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { sortedById } from "./ids.ts";

// Pure builders of the console events of ADR 0031 point 3: each decides what
// changed, none reads a clock or touches state.

type DiagnosticsByDrive = ReadonlyMap<string, readonly DriveDiagnostic[]>;

// Drives that the document no longer holds are not compared: deleting a drive
// is not the diagnostic clearing.
export function diagnosticEvents(
  document: PantinDocument,
  before: DiagnosticsByDrive,
  after: DiagnosticsByDrive,
): ConsoleEvent[] {
  const events: ConsoleEvent[] = [];
  for (const { id } of sortedById(document.drives)) {
    const previous = before.get(id) ?? [];
    const current = after.get(id) ?? [];
    const source = { kind: "drive", id } as const;
    for (const diagnostic of current.filter((candidate) => !previous.includes(candidate))) {
      events.push({
        code: "diagnostic_raised",
        level: "warning",
        source,
        params: { diagnostic },
      });
    }
    for (const diagnostic of previous.filter((candidate) => !current.includes(candidate))) {
      events.push({ code: "diagnostic_cleared", level: "info", source, params: { diagnostic } });
    }
  }
  return events;
}

export function faultEvent(
  source: Extract<ConsoleSource, { kind: "drive" | "joint" }>,
  fault: "unresponsive" | "jammed",
  isSet: boolean,
): ConsoleEvent {
  return {
    code: isSet ? "fault_set" : "fault_cleared",
    level: "info",
    source,
    params: { fault },
  };
}

export function migratedEvent(from: number): ConsoleEvent {
  return {
    code: "migrated",
    level: "info",
    source: { kind: "pantin" },
    params: { from, to: PANTIN_SCHEMA_VERSION },
  };
}

// ADR 0045 point 12: a pause while a bridge is connected is a warning, since
// the PLC sees a machine that stopped answering.
export function clockEvent(running: boolean, bridgeConnected: boolean): ConsoleEvent {
  if (!running && bridgeConnected) {
    return pausedWithBridgeEvent();
  }
  return {
    code: running ? "clock_resumed" : "clock_paused",
    level: "info",
    source: { kind: "pantin" },
    params: {},
  };
}

export function pausedWithBridgeEvent(): ConsoleEvent {
  return {
    code: "clock_paused_with_bridge",
    level: "warning",
    source: { kind: "pantin" },
    params: {},
  };
}

// ADR 0031 point 6: the PLC wrote a forced tag; its write was ignored.
export function forcedTagWrittenEvent(
  tag: string,
  forcedValue: number,
  writtenValue: number,
): ConsoleEvent {
  return {
    code: "forced_tag_written",
    level: "error",
    source: { kind: "pantin" },
    params: { tag, forcedValue, writtenValue },
  };
}

export type ConnectionLossReason = "closed" | "timeout";

// ADR 0045 point 11.
export function plcModuleEvent(
  module: string,
  status: { connected: true } | { connected: false; reason: ConnectionLossReason },
): ConsoleEvent {
  const source = { kind: "pantin" } as const;
  return status.connected
    ? { code: "plc_connected", level: "info", source, params: { module } }
    : {
        code: "plc_disconnected",
        level: "warning",
        source,
        params: { module, reason: status.reason },
      };
}

export function bridgeEvent(
  status: { connected: true } | { connected: false; reason: ConnectionLossReason },
): ConsoleEvent {
  const source = { kind: "pantin" } as const;
  return status.connected
    ? { code: "bridge_connected", level: "info", source, params: {} }
    : { code: "bridge_disconnected", level: "warning", source, params: { reason: status.reason } };
}

const MAX_STEP_ERROR_DETAIL = 300;

export function stepErrorEvent(error: unknown): ConsoleEvent {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "step_error",
    level: "error",
    source: { kind: "pantin" },
    params: { detail: message.slice(0, MAX_STEP_ERROR_DETAIL) },
  };
}

// The fault and diagnostic state about to be forgotten, of one drive or of the whole Pantin.
type FaultAndDiagnosticState = {
  unresponsiveDriveIds: ReadonlySet<string>;
  jammedJointIds: ReadonlySet<string>;
  driveDiagnostics: DiagnosticsByDrive;
};

// Forgetting runtime state is not silent: what it clears is reported as
// cleared, so the console does not end on a fault or diagnostic that no longer
// holds, and a later one does not fold into it.
export function driveClearedEvents(
  state: FaultAndDiagnosticState,
  driveId: string,
): ConsoleEvent[] {
  const source = { kind: "drive", id: driveId } as const;
  const events: ConsoleEvent[] = [];
  if (state.unresponsiveDriveIds.has(driveId)) {
    events.push(faultEvent(source, "unresponsive", false));
  }
  for (const diagnostic of state.driveDiagnostics.get(driveId) ?? []) {
    events.push({ code: "diagnostic_cleared", level: "info", source, params: { diagnostic } });
  }
  return events;
}

function jointClearedEvents(state: FaultAndDiagnosticState, jointId: string): ConsoleEvent[] {
  return state.jammedJointIds.has(jointId)
    ? [faultEvent({ kind: "joint", id: jointId }, "jammed", false)]
    : [];
}

// Back to the reference configuration: every fault and diagnostic clears.
export function allClearedEvents(state: FaultAndDiagnosticState): ConsoleEvent[] {
  const driveIds = [...new Set([...state.unresponsiveDriveIds, ...state.driveDiagnostics.keys()])];
  return [
    ...[...state.jammedJointIds].sort().flatMap((id) => jointClearedEvents(state, id)),
    ...driveIds.sort().flatMap((id) => driveClearedEvents(state, id)),
  ];
}

// ADR 0043 point 5: a spawn the planning skipped, with the reason it gives.
export function spawnSkippedEvent(
  emitter: string,
  reason: "emitter_blocked" | "product_limit",
): ConsoleEvent {
  return { code: reason, level: "warning", source: { kind: "pantin" }, params: { emitter } };
}

// ADR 0043 point 11: reported only when products were cleared, so that editing
// a belt on an empty line stays silent.
export function physicsRebuiltEvent(products: number): ConsoleEvent {
  return {
    code: "physics_rebuilt",
    level: "info",
    source: { kind: "pantin" },
    params: { products },
  };
}
