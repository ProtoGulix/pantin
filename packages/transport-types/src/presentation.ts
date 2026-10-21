import { MODBUS_TCP_SLAVE_PRESENTATION } from "./modbus-tcp-slave/presentation.ts";
import type { TransportPresentation } from "./presentation-types.ts";
import type { TransportKind } from "./schemas.ts";

// Registry of the transport presentations, for the core and the viewer (ADR 0064 point 3).

export type { TransportPresentation } from "./presentation-types.ts";

export const TRANSPORT_PRESENTATION: Readonly<Record<TransportKind, TransportPresentation>> = {
  modbus_tcp_slave: MODBUS_TCP_SLAVE_PRESENTATION,
};
