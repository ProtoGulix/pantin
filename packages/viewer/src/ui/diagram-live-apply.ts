import type { PantinDocument } from "@pantin/protocol";
import { commandSocketName, forcedValueText } from "../diagram/diagram-forcing.ts";
import { type LitState, nodeLitStates } from "../diagram/diagram-lit-states.ts";
import {
  changedDiagnostics,
  diffSets,
  type LiveState,
  type SetChanges,
} from "../diagram/diagram-live.ts";
import type { ChainDiagram } from "../diagram/diagram-types.ts";
import { forcedTagUnit, forcedTagUnitLabel } from "../drives/drive-tags.ts";
import type { Translate } from "../i18n/translate.ts";
import type { DrawnDiagram } from "./diagram-draw.ts";
import { showNodeWarning } from "./diagram-warning.ts";

// Applies the live state to the drawing in place, and only where it changed:
// tags are read four times a second. Colour and outline for the eyes, words
// (aria-label of a port, aria-description of a node) for assistive technology.

function setClass(target: Element | undefined, name: string, on: boolean): void {
  target?.classList.toggle(name, on);
}

/** Switches a class on for what was added and off for what was removed. */
export function applyChanges(
  changes: SetChanges,
  find: (id: string) => Element | undefined,
  className: string,
): void {
  for (const id of changes.added) {
    setClass(find(id), className, true);
  }
  for (const id of changes.removed) {
    setClass(find(id), className, false);
  }
}

// A socket key is "<node id>|<socket id>".
function portOf(drawn: DrawnDiagram, key: string) {
  const [nodeId = "", socketId = ""] = key.split("|");
  return drawn.nodes.get(nodeId)?.sockets.get(socketId);
}

export function applyLive(
  drawn: DrawnDiagram,
  t: Translate,
  previous: LiveState,
  next: LiveState,
): void {
  const lit = diffSets(previous.litSockets, next.litSockets);
  applyChanges(lit, (key) => portOf(drawn, key)?.group, "is-lit");
  // A toggle says its state as pressed, not in its name (applyLitText leaves it alone).
  for (const [keys, pressed] of [
    [lit.added, "true"],
    [lit.removed, "false"],
  ] as const) {
    for (const key of keys) {
      const port = portOf(drawn, key);
      if (port?.forcing === "toggle") {
        port.group.setAttribute("aria-pressed", pressed);
      }
    }
  }
  applyChanges(diffSets(previous.litEdges, next.litEdges), (id) => drawn.edges.get(id), "is-lit");
  for (const [nodeId, lines] of changedDiagnostics(previous.diagnostics, next.diagnostics)) {
    const node = drawn.nodes.get(nodeId);
    if (node !== undefined) {
      showNodeWarning(node, lines, t);
    }
  }
}

const sameStates = (a: ReadonlyMap<string, LitState>, b: ReadonlyMap<string, LitState>) =>
  a.size === b.size && [...a].every(([key, state]) => b.get(key) === state);

/**
 * Says what is lit in words (ADR 0029 point 7): a port's accessible name ends
 * with its state, and a node's description lists the states of its sockets.
 */
export function applyLitText(
  drawn: DrawnDiagram,
  t: Translate,
  previous: ReadonlyMap<string, LitState>,
  next: ReadonlyMap<string, LitState>,
): void {
  if (sameStates(previous, next)) {
    return;
  }
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const port = portOf(drawn, key);
    const state = next.get(key);
    if (port !== undefined && port.baseLabel !== "" && port.forcing === null) {
      const label =
        state === undefined ? port.baseLabel : `${port.baseLabel}, ${t(`diagram.lit.${state}`)}`;
      port.group.setAttribute("aria-label", label);
    }
  }
  const before = nodeLitStates(previous);
  const after = nodeLitStates(next);
  for (const nodeId of new Set([...before.keys(), ...after.keys()])) {
    const states = after.get(nodeId);
    const group = drawn.nodes.get(nodeId)?.group;
    if (states === undefined) {
      group?.removeAttribute("aria-description");
    } else {
      group?.setAttribute("aria-description", states.map((s) => t(`diagram.lit.${s}`)).join(", "));
    }
  }
}

/**
 * A numeric command's accessible name carries its value, in display units
 * (ADR 0030 point 3); only the sockets whose value changed are touched.
 */
export function applyForcedValues(
  drawn: DrawnDiagram,
  context: { diagram: ChainDiagram; document: PantinDocument; t: Translate },
  previous: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
): void {
  const { diagram, document, t } = context;
  for (const node of diagram.nodes) {
    for (const socket of node.sockets) {
      const value = socket.tagName === undefined ? undefined : next.get(socket.tagName);
      if (socket.tagType !== "number" || socket.tagName === undefined || value === undefined) {
        continue;
      }
      if (value !== previous.get(socket.tagName)) {
        const unit = forcedTagUnit(document, socket.tagName);
        const symbol = forcedTagUnitLabel(document, socket.tagName, t);
        const text = forcedValueText(value, unit, symbol);
        const label = commandSocketName(socket, t, { text });
        drawn.nodes.get(node.id)?.sockets.get(socket.id)?.group.setAttribute("aria-label", label);
      }
    }
  }
}
