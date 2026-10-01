import type { JointCoordinateUnit } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { parseNumber } from "../joints/joint-form.ts";
import { coordinateToDisplay, formatDisplayNumber } from "../units.ts";
import type { FocusTarget } from "./diagram-focus.ts";
import type { ChainDiagram, Socket } from "./diagram-types.ts";

// What a click or a key does on a socket (ADR 0030 point 3), as pure
// decisions: a bit command is toggled, a numeric command opens an input, a
// power port opens "Relier à…", and nothing else does anything. The page only
// carries the decision out.

export type SocketPress = "click" | "enter" | "space" | "menu";

export type SocketAction =
  | { kind: "none" }
  | { kind: "toggle"; tag: string }
  | { kind: "openInput"; tag: string }
  | { kind: "openLinkMenu" };

const NONE: SocketAction = { kind: "none" };

function commandAction(socket: Socket, press: SocketPress): SocketAction {
  if (socket.tagName === undefined) {
    return NONE;
  }
  const { tagName: tag } = socket;
  // A bit is a switch (click, Space); a number is a field (click, Enter).
  if (socket.tagType === "bit") {
    return press === "click" || press === "space" ? { kind: "toggle", tag } : NONE;
  }
  return press === "click" || press === "enter" ? { kind: "openInput", tag } : NONE;
}

/**
 * What a press on a socket does. A tag is never linked, so Enter on a command
 * tag does not open "Relier à…"; a sensor's tag is read only.
 */
export function socketAction(socket: Socket, press: SocketPress): SocketAction {
  switch (socket.role) {
    case "command":
      return commandAction(socket, press);
    case "feedback":
      return NONE;
    default:
      return press === "enter" || press === "menu" ? { kind: "openLinkMenu" } : NONE;
  }
}

/** The socket a focus target stands for; null for a node. */
export function socketOf(diagram: ChainDiagram, target: FocusTarget): Socket | null {
  const node = diagram.nodes.find((candidate) => candidate.id === target.nodeId);
  return node?.sockets.find((candidate) => candidate.id === target.socketId) ?? null;
}

export type ForcedInput = { ok: true; value: number } | { ok: false };

/** The typed text of a numeric command, in display units; a decimal comma is accepted. */
export function parseForcedInput(text: string): ForcedInput {
  const value = parseNumber(text);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/** The accessible name of a command tag socket: its label, its value, and what a press does. */
export function commandSocketName(
  socket: Socket,
  t: Translate,
  value: { text: string } | null = null,
): string {
  if (socket.tagType === "bit") {
    return t("diagram.tag.bit", { name: socket.label });
  }
  return value === null
    ? t("diagram.tag.number", { name: socket.label })
    : t("diagram.tag.numberValue", { name: socket.label, value: value.text });
}

/** A value read from the core, in display units, as the field of the input shows it. */
export function forcedDisplayNumber(value: number, unit: JointCoordinateUnit): string {
  return formatDisplayNumber(coordinateToDisplay(unit, value));
}

/** The same with its symbol: "40 mm". */
export function forcedValueText(
  value: number,
  unit: JointCoordinateUnit,
  symbol: string | null,
): string {
  const text = forcedDisplayNumber(value, unit);
  return symbol === null ? text : `${text} ${symbol}`;
}
