import type { RuleModule, TransportProblem } from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import {
  BIT_ZONES,
  IO_TYPE_BY_SIGNAL_TYPE,
  ioWidthOf,
  ZONES_BY_DIRECTION,
} from "./rules-allocation.ts";
import { type IoZone, MODBUS_MAX_ADDRESS, type ModbusChannel } from "./schema.ts";

/** The Modbus view of a channel: the common fields and a sub-object that is there. */
type ModbusPlaced = { index: number; tag: string; modbus: ModbusChannel };

// Every channel of a Modbus module has its sub-object (the document schema
// guarantees it); one without is left to that schema rather than guessed at.
function placedChannelsOf(module: RuleModule): ModbusPlaced[] {
  return module.channels.flatMap((channel, index) =>
    channel.modbus === undefined ? [] : [{ index, tag: channel.tag, modbus: channel.modbus }],
  );
}

export function modbusFieldsOf(module: RuleModule): ModbusChannel[] {
  return placedChannelsOf(module).map((placed) => placed.modbus);
}

function problem(
  placed: ModbusPlaced,
  field: keyof ModbusChannel,
  code: TransportProblem["code"],
  message: string,
): TransportProblem {
  return { path: ["channels", placed.index, "modbus", field], code, message };
}

function signalProblems(placed: ModbusPlaced, signal: SignalShape): TransportProblem[] {
  const { modbus } = placed;
  const problems: TransportProblem[] = [];
  if (!ZONES_BY_DIRECTION[signal.direction].includes(modbus.zone)) {
    const wanted = ZONES_BY_DIRECTION[signal.direction].join(" or ");
    problems.push(
      problem(
        placed,
        "zone",
        "zone_direction_mismatch",
        `Tag "${placed.tag}" is a ${signal.direction}: its zone is ${wanted}, not ${modbus.zone}.`,
      ),
    );
  }
  const wantedType = IO_TYPE_BY_SIGNAL_TYPE[signal.type];
  if (modbus.ioType !== wantedType) {
    problems.push(
      problem(
        placed,
        "ioType",
        "type_mismatch",
        `Tag "${placed.tag}" is a ${signal.type}: its type is ${wantedType}, not ${modbus.ioType}.`,
      ),
    );
  }
  return problems;
}

// BOOL lives in a bit zone, REAL and DINT in a register zone, whatever the tag.
function typeZoneProblems(placed: ModbusPlaced): TransportProblem[] {
  const { modbus } = placed;
  if ((modbus.ioType === "BOOL") === BIT_ZONES.includes(modbus.zone)) {
    return [];
  }
  const wanted =
    modbus.ioType === "BOOL" ? "a coil or a discrete input" : "a holding or an input register";
  return [
    problem(
      placed,
      "zone",
      "type_zone_mismatch",
      `A ${modbus.ioType} goes to ${wanted}, not to ${modbus.zone}.`,
    ),
  ];
}

// The schema holds the start address in 0..65535; a REAL or DINT may still run past the end.
function lastAddressOf(modbus: ModbusChannel): number {
  return modbus.address + ioWidthOf(modbus.ioType) - 1;
}

function rangeProblems(placed: ModbusPlaced): TransportProblem[] {
  const last = lastAddressOf(placed.modbus);
  if (last <= MODBUS_MAX_ADDRESS) {
    return [];
  }
  const { address, ioType } = placed.modbus;
  return [
    problem(
      placed,
      "address",
      "address_out_of_range",
      `Address ${address} is out of 0..${MODBUS_MAX_ADDRESS} (a ${ioType} takes ${ioWidthOf(ioType)} registers, up to ${last}).`,
    ),
  ];
}

function overlapProblems(placedChannels: readonly ModbusPlaced[]): TransportProblem[] {
  const groups = new Map<IoZone, ModbusPlaced[]>();
  for (const placed of placedChannels.filter(
    (candidate) => rangeProblems(candidate).length === 0,
  )) {
    groups.set(placed.modbus.zone, [...(groups.get(placed.modbus.zone) ?? []), placed]);
  }
  return [...groups.values()].flatMap(overlapsInZone);
}

// Channels of one zone, by address then position: each one that starts before
// the furthest reach so far overlaps the channel that reaches it.
function overlapsInZone(group: readonly ModbusPlaced[]): TransportProblem[] {
  const sorted = group.toSorted((a, b) => a.modbus.address - b.modbus.address || a.index - b.index);
  const problems: TransportProblem[] = [];
  let reaching: ModbusPlaced | undefined;
  for (const placed of sorted) {
    const reach = reaching === undefined ? 0 : lastAddressOf(reaching.modbus) + 1;
    if (reaching !== undefined && placed.modbus.address < reach) {
      problems.push(
        problem(
          placed,
          "address",
          "address_overlap",
          `Address ${placed.modbus.address} in zone ${placed.modbus.zone} overlaps tag "${reaching.tag}" (${reaching.modbus.address}..${reach - 1}).`,
        ),
      );
    }
    if (reaching === undefined || lastAddressOf(placed.modbus) + 1 > reach) {
      reaching = placed;
    }
  }
  return problems;
}

export function validateModbusModule(
  module: RuleModule,
  signals: ReadonlyMap<string, SignalShape>,
): TransportProblem[] {
  const placedChannels = placedChannelsOf(module);
  return [
    ...placedChannels.flatMap((placed) => {
      const signal = signals.get(placed.tag);
      return [
        ...(signal === undefined ? [] : signalProblems(placed, signal)),
        ...typeZoneProblems(placed),
        ...rangeProblems(placed),
      ];
    }),
    ...overlapProblems(placedChannels),
  ];
}
