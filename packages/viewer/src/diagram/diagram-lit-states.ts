import { type LiveState, socketKey } from "./diagram-live.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// What the colour of a lit socket or edge says, in words for assistive
// technology (ADR 0029 point 7): a bit at 1 is "active", a pneumatic link with
// pressure "under pressure", a powered AC link "powered". Read from the live
// state the view already has; nothing is computed from the machine here.

export type LitState = "active" | "pressure" | "powered";

/** The lit state of each socket ("<node id>|<socket id>") that has one. */
export function socketLitStates(diagram: ChainDiagram, live: LiveState): Map<string, LitState> {
  const states = new Map<string, LitState>();
  for (const key of live.litSockets) {
    states.set(key, "active");
  }
  for (const edge of diagram.edges) {
    if (live.litEdges.has(edge.id)) {
      // Both ends of a lit wire carry what the wire carries.
      const state = edge.kind === "ac_power" ? "powered" : "pressure";
      states.set(socketKey(edge.fromNode, edge.fromSocket), state);
      states.set(socketKey(edge.toNode, edge.toSocket), state);
    }
  }
  return states;
}

/** The distinct lit states of each node that has a lit socket, by node id. */
export function nodeLitStates(states: ReadonlyMap<string, LitState>): Map<string, LitState[]> {
  const byNode = new Map<string, LitState[]>();
  for (const [key, state] of states) {
    const nodeId = key.slice(0, key.indexOf("|"));
    const known = byNode.get(nodeId) ?? [];
    byNode.set(nodeId, known.includes(state) ? known : [...known, state]);
  }
  return byNode;
}
