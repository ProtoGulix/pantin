import type { SignalDirection, SignalShape, SignalType } from "../schema-common.ts";
import { type IoType, type IoZone, MODBUS_MAX_ADDRESS, type ModbusChannel } from "./schema.ts";

// What ADR 0045 point 8 fixes about a mapped tag: each valid (tag type,
// direction) pair has exactly one zone and one PLC type. Shared by the
// validation of io.json and by the allocation functions. Pure.

export const BIT_ZONES: readonly IoZone[] = ["coil", "discrete_input"];
export const ZONES_BY_DIRECTION: Record<SignalDirection, readonly IoZone[]> = {
  command: ["coil", "holding_register"],
  feedback: ["discrete_input", "input_register"],
};
export const IO_TYPE_BY_SIGNAL_TYPE: Record<SignalType, IoType> = {
  bit: "BOOL",
  float: "REAL",
  integer: "DINT",
};
const FIRST_MODULE_PORT = 1502;
const MAX_PORT = 65535;

/** Registers (or bits) a mapped value takes: REAL and DINT take two registers. */
export function ioWidthOf(ioType: IoType): number {
  return ioType === "BOOL" ? 1 : 2;
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

/** The zone and PLC type of a signal (ADR 0045 point 8: one of each per valid pair). */
export function zoneAndTypeOf(signal: SignalShape): { zone: IoZone; ioType: IoType } {
  const [bitZone, registerZone] = ZONES_BY_DIRECTION[signal.direction];
  const zone = signal.type === "bit" ? bitZone : registerZone;
  if (zone === undefined) {
    throw new Error(`No zone is defined for a ${signal.direction} of type ${signal.type}.`);
  }
  return { zone, ioType: IO_TYPE_BY_SIGNAL_TYPE[signal.type] };
}

/**
 * The lowest address of `zone` where a value of `ioType` fits without
 * overlapping `channels` (those of one module). Bit zones step by 1, register
 * zones by 2 from 0: a register zone only holds two-register values, so REAL
 * and DINT stay on even addresses. Null when the zone is full.
 */
export function proposeAddress(
  channels: readonly Pick<ModbusChannel, "zone" | "address" | "ioType">[],
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
