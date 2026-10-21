import type { TransportPresentation } from "../presentation-types.ts";
import { MODBUS_TCP_SLAVE_KIND } from "./schema.ts";

// Pure text of the Modbus TCP slave transport (ADR 0064 point 3).

export const MODBUS_TCP_SLAVE_PRESENTATION: TransportPresentation = {
  kind: MODBUS_TCP_SLAVE_KIND,
  transportText: () => "Modbus TCP slave",
  endpointText: (transport) =>
    transport.kind === MODBUS_TCP_SLAVE_KIND
      ? `port ${transport.port}, unit ${transport.unitId}`
      : "",
  addressText: (channel) =>
    channel.modbus === undefined ? "" : `${channel.modbus.zone} ${channel.modbus.address}`,
  plcTypeText: (channel) => channel.modbus?.ioType ?? "",
};
