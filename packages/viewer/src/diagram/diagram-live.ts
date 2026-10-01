import type { DriveRuntime, PantinDocument } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { type DiagnosticLine, diagnosticLines } from "../panel/drive-diagnostics.ts";
import { driveNode } from "./diagram-chains.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// The live state of the diagram (ADR 0029 point 8), from the tag values and
// the drive runtime the core reports. The viewer only reads them: it never
// derives a state of its own.
//
// Rules:
// - a command or feedback tag at 1 lights its socket;
// - a pneumatic port lights its edges under pressure (not when exhausted or blocked);
// - an AC power port lights its edges when the direction is not 0;
// - a servo port never lights: its state is a setpoint, not a flow, so there
//   is no rest to tell it from, and the motion shows on the joint in 3D and on
//   the feedback tag's socket; mechanical and observation edges never light;
// - a drive with a diagnostic is outlined and names it.

export interface LiveState {
  // "<node id>|<socket id>".
  litSockets: ReadonlySet<string>;
  litEdges: ReadonlySet<string>;
  // Drive node id to its active diagnostics; only drives that have one.
  diagnostics: ReadonlyMap<string, readonly DiagnosticLine[]>;
}

export const NO_LIVE_STATE: LiveState = {
  litSockets: new Set(),
  litEdges: new Set(),
  diagnostics: new Map(),
};

export const socketKey = (nodeId: string, socketId: string) => `${nodeId}|${socketId}`;

// A bit is 1 in the process image; half is the threshold the inspector uses too.
const BIT_THRESHOLD = 0.5;

function litSockets(diagram: ChainDiagram, tagValues: ReadonlyMap<string, number>): Set<string> {
  const lit = new Set<string>();
  for (const node of diagram.nodes) {
    for (const socket of node.sockets) {
      const value = socket.tagName === undefined ? undefined : tagValues.get(socket.tagName);
      if (value !== undefined && value >= BIT_THRESHOLD) {
        lit.add(socketKey(node.id, socket.id));
      }
    }
  }
  return lit;
}

function portIsActive(kind: string, state: DriveRuntime["ports"][string] | undefined): boolean {
  if (state === undefined) {
    return false;
  }
  if (kind === "pneumatic") {
    return state === "pressure";
  }
  return (
    kind === "ac_power" &&
    typeof state === "object" &&
    "direction" in state &&
    state.direction !== 0
  );
}

function litEdges(diagram: ChainDiagram, runtime: ReadonlyMap<string, DriveRuntime>): Set<string> {
  const driveIds = new Map(
    diagram.nodes.filter((node) => node.kind === "drive").map((node) => [node.id, node.elementId]),
  );
  const lit = new Set<string>();
  for (const edge of diagram.edges) {
    const driveId = driveIds.get(edge.fromNode);
    const port = edge.fromSocket.startsWith("out:") ? edge.fromSocket.slice("out:".length) : null;
    if (driveId !== undefined && port !== null) {
      if (portIsActive(edge.kind, runtime.get(driveId)?.ports[port])) {
        lit.add(edge.id);
      }
    }
  }
  return lit;
}

function diagnosticsOf(
  document: PantinDocument,
  runtime: ReadonlyMap<string, DriveRuntime>,
  t: Translate,
): Map<string, DiagnosticLine[]> {
  const found = new Map<string, DiagnosticLine[]>();
  for (const drive of document.drives) {
    const diagnostics = runtime.get(drive.id)?.diagnostics ?? [];
    if (diagnostics.length > 0) {
      found.set(driveNode(drive.id), diagnosticLines(diagnostics, drive.type, t));
    }
  }
  return found;
}

export function liveStateOf(
  diagram: ChainDiagram,
  document: PantinDocument,
  values: { tags: ReadonlyMap<string, number>; runtime: ReadonlyMap<string, DriveRuntime> },
  t: Translate,
): LiveState {
  return {
    litSockets: litSockets(diagram, values.tags),
    litEdges: litEdges(diagram, values.runtime),
    diagnostics: diagnosticsOf(document, values.runtime, t),
  };
}

export interface SetChanges {
  added: string[];
  removed: string[];
}

/** What to switch on and off to go from one set to the next: the view only touches these. */
export function diffSets(previous: ReadonlySet<string>, next: ReadonlySet<string>): SetChanges {
  return {
    added: [...next].filter((item) => !previous.has(item)),
    removed: [...previous].filter((item) => !next.has(item)),
  };
}

const signatureOf = (lines: readonly DiagnosticLine[] | undefined) =>
  (lines ?? []).map((line) => `${line.id}:${line.text}`).join("|");

/** The drives whose diagnostics changed, with their new lines (empty once cleared). */
export function changedDiagnostics(
  previous: LiveState["diagnostics"],
  next: LiveState["diagnostics"],
): Map<string, readonly DiagnosticLine[]> {
  const changed = new Map<string, readonly DiagnosticLine[]>();
  for (const nodeId of new Set([...previous.keys(), ...next.keys()])) {
    if (signatureOf(previous.get(nodeId)) !== signatureOf(next.get(nodeId))) {
      changed.set(nodeId, next.get(nodeId) ?? []);
    }
  }
  return changed;
}
