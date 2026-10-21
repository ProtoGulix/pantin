import type { RuleModule, TransportRules } from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import type {
  ChannelPatchTransportFields,
  ChannelTransportFields,
  TransportChannel,
  TransportConfig,
  TransportPatch,
} from "../schemas.ts";
import { ioWidthOf, proposeAddress, smallestFreePort, zoneAndTypeOf } from "./rules-allocation.ts";
import { modbusFieldsOf, validateModbusModule } from "./rules-validation.ts";
import {
  DEFAULT_UNIT_ID,
  DEFAULT_WATCHDOG_MILLISECONDS,
  DEFAULT_WORD_ORDER,
  IO_ZONES,
  MODBUS_TCP_SLAVE_KIND,
  type ModbusTcpSlaveTransport,
} from "./schema.ts";

// The Modbus TCP slave rules of the transport registry (ADR 0064 point 3). Pure.

function proposeChannel(module: RuleModule, signal: SignalShape) {
  const { zone, ioType } = zoneAndTypeOf(signal);
  const address = proposeAddress(modbusFieldsOf(module), zone, ioType);
  if (address === null) {
    return {
      refusal: `Module "${module.key}" has no free address left in zone ${zone}: use another module.`,
    };
  }
  return { fields: { modbus: { zone, address, ioType } } };
}

function reshapeChannel(
  module: RuleModule,
  channel: TransportChannel,
  signal: SignalShape,
  moved: boolean,
) {
  const derived = zoneAndTypeOf(signal);
  const current = channel.modbus;
  const keepsAddress =
    !moved &&
    current !== undefined &&
    current.zone === derived.zone &&
    ioWidthOf(current.ioType) === ioWidthOf(derived.ioType);
  if (keepsAddress) {
    return { fields: { modbus: { ...derived, address: current.address } } };
  }
  return proposeChannel(module, signal);
}

function modbusTransportOf(transport: TransportConfig): ModbusTcpSlaveTransport {
  if (transport.kind !== MODBUS_TCP_SLAVE_KIND) {
    throw new Error(`Modbus rules were given a "${transport.kind}" module.`);
  }
  return transport;
}

function createTransport(patch: TransportPatch, usedPorts: readonly number[]) {
  const port = patch.port ?? smallestFreePort(usedPorts);
  if (port === null) {
    return "Every port from 1502 to 65535 is used: remove a module.";
  }
  return {
    kind: MODBUS_TCP_SLAVE_KIND,
    port,
    unitId: patch.unitId ?? DEFAULT_UNIT_ID,
    wordOrder: patch.wordOrder ?? DEFAULT_WORD_ORDER,
    watchdogMilliseconds: patch.watchdogMilliseconds ?? DEFAULT_WATCHDOG_MILLISECONDS,
  } satisfies ModbusTcpSlaveTransport;
}

// An absent field means "unchanged": spreading `undefined` would erase it.
function patchTransport(transport: TransportConfig, patch: TransportPatch): TransportConfig {
  const current = modbusTransportOf(transport);
  return {
    kind: current.kind,
    port: patch.port ?? current.port,
    unitId: patch.unitId ?? current.unitId,
    wordOrder: patch.wordOrder ?? current.wordOrder,
    watchdogMilliseconds: patch.watchdogMilliseconds ?? current.watchdogMilliseconds,
  };
}

// Keys are listed one by one so that the text does not depend on how the object was built.
function orderedTransport(transport: TransportConfig): TransportConfig {
  return patchTransport(transport, { kind: MODBUS_TCP_SLAVE_KIND });
}

function patchChannel(
  channel: TransportChannel,
  patch: ChannelPatchTransportFields,
): ChannelTransportFields {
  if (channel.modbus === undefined) {
    return {};
  }
  return {
    modbus: { ...channel.modbus, address: patch.modbus?.address ?? channel.modbus.address },
  };
}

function orderedChannelFields(channel: TransportChannel): ChannelTransportFields {
  const { modbus } = channel;
  return modbus === undefined
    ? {}
    : { modbus: { zone: modbus.zone, address: modbus.address, ioType: modbus.ioType } };
}

function compareText(first: string, second: string): number {
  // Code units, not a locale: the order must be the same on every machine.
  return first < second ? -1 : first > second ? 1 : 0;
}

/** Zone (order of IO_ZONES), then address, then tag. */
function compareChannels(first: TransportChannel, second: TransportChannel): number {
  const firstZone = first.modbus === undefined ? -1 : IO_ZONES.indexOf(first.modbus.zone);
  const secondZone = second.modbus === undefined ? -1 : IO_ZONES.indexOf(second.modbus.zone);
  return (
    firstZone - secondZone ||
    (first.modbus?.address ?? 0) - (second.modbus?.address ?? 0) ||
    compareText(first.tag, second.tag)
  );
}

export const MODBUS_TCP_SLAVE_RULES: TransportRules = {
  kind: MODBUS_TCP_SLAVE_KIND,
  // Every (type, direction) pair has a zone (ADR 0045 point 8).
  supportsSignal: () => true,
  listenPort: (transport) => modbusTransportOf(transport).port,
  createTransport,
  patchTransport,
  orderedTransport,
  proposeChannel,
  reshapeChannel,
  patchChannel,
  orderedChannelFields,
  compareChannels,
  validateModule: validateModbusModule,
};
