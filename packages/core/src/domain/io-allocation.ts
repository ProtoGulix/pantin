import type { IoChannel, IoType, IoZone, TagDirection, TagType } from "@pantin/protocol";
import { MODBUS_MAX_ADDRESS } from "@pantin/protocol";
import { deriveVariable, VARIABLE_MAX_LENGTH } from "./io-identifiers.ts";
import { BIT_ZONES, IO_TYPE_BY_TAG_TYPE, ioWidthOf, ZONES_BY_DIRECTION } from "./io-rules.ts";

// What the core proposes when a module or a channel is created (ADR 0049
// point 4): pure, shared with the CLI so that `pantin io init` and the editor
// allocate the same way.

const FIRST_MODULE_PORT = 1502;
const MAX_PORT = 65535;

/** The smallest `m<n>` (n from 1) that no module uses. */
export function nextModuleKey(usedKeys: readonly string[]): string {
  const used = new Set(usedKeys);
  let number = 1;
  while (used.has(`m${number}`)) {
    number += 1;
  }
  return `m${number}`;
}

/** The smallest port from 1502 that no module uses; null when all are taken. */
export function smallestFreePort(usedPorts: readonly number[]): number | null {
  const used = new Set(usedPorts);
  for (let port = FIRST_MODULE_PORT; port <= MAX_PORT; port += 1) {
    if (!used.has(port)) {
      return port;
    }
  }
  return null;
}

/** The zone and PLC type of a tag (ADR 0045 point 8: one of each per valid pair). */
export function zoneAndTypeOf(
  type: TagType,
  direction: TagDirection,
): { zone: IoZone; ioType: IoType } {
  const [bitZone, registerZone] = ZONES_BY_DIRECTION[direction];
  const zone = type === "bit" ? bitZone : registerZone;
  if (zone === undefined) {
    throw new Error(`No zone is defined for a ${direction} of type ${type}.`);
  }
  return { zone, ioType: IO_TYPE_BY_TAG_TYPE[type] };
}

/**
 * The lowest address of `zone` where a value of `ioType` fits without
 * overlapping `channels` (those of one module). Bit zones step by 1, register
 * zones by 2 from 0: a register zone only holds two-register values, so REAL
 * and DINT stay on even addresses. Null when the zone is full.
 */
export function proposeAddress(
  channels: readonly Pick<IoChannel, "zone" | "address" | "ioType">[],
  zone: IoZone,
  ioType: IoType,
): number | null {
  const step = BIT_ZONES.includes(zone) ? 1 : 2;
  const width = ioWidthOf(ioType);
  const taken = channels
    .filter((channel) => channel.zone === zone)
    .toSorted((first, second) => first.address - second.address);
  // One sweep over the occupied spans in address order: the candidate only
  // moves up, so a full zone costs a pass, not a pass per address.
  let candidate = 0;
  for (const other of taken) {
    if (candidate + width <= other.address) {
      break;
    }
    const end = other.address + ioWidthOf(other.ioType);
    candidate = Math.max(candidate, Math.ceil(end / step) * step);
  }
  return candidate + width - 1 <= MODBUS_MAX_ADDRESS ? candidate : null;
}

/**
 * The CODESYS variable of a tag that no variable of `takenVariables` equals,
 * ignoring case: `_2`, `_3` and so on are appended, the base shortened so the
 * whole stays within 64 characters.
 */
export function allocateVariable(tagName: string, takenVariables: readonly string[]): string {
  const taken = new Set(takenVariables.map((variable) => variable.toLowerCase()));
  const base = deriveVariable(tagName);
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = `_${suffixNumber}`;
    // A trailing "_" left by the cut would make a double underscore, which
    // CODESYS refuses.
    const cut = base.slice(0, VARIABLE_MAX_LENGTH - suffix.length).replace(/_+$/, "");
    const candidate = `${cut}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}
