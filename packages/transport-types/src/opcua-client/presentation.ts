import type { TransportPresentation } from "../presentation-types.ts";
import { OPCUA_CLIENT_KIND } from "./schema.ts";

// Pure text of the OPC UA client transport (ADR 0064 point 3).

export const OPCUA_CLIENT_PRESENTATION: TransportPresentation = {
  kind: OPCUA_CLIENT_KIND,
  transportText: () => "OPC UA client",
  endpointText: (transport) =>
    transport.kind === OPCUA_CLIENT_KIND
      ? `port ${transport.port}${transport.endpointPath}, ${transport.securityMode} ${transport.securityPolicy}`
      : "",
  // The channel alone does not know its derived NodeId (the core resolves it from the module).
  addressText: (channel) => channel.opcua?.identifier ?? "derived node",
  plcTypeText: (channel) => channel.opcua?.iecType ?? "",
};
