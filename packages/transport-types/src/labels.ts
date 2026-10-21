import { MODBUS_TCP_SLAVE_LABELS } from "./modbus-tcp-slave/labels.ts";
import type { TransportLabels, TransportLanguage } from "./schema-common.ts";
import type { TransportKind } from "./schemas.ts";

// Registry of transport labels, for clients (ADR 0064 point 3). Each folder's own
// labels.ts is typed after its schema, so a missing label does not compile.

export type TransportKindLabels = TransportLabels<string, string, string>;

export const TRANSPORT_LABELS: Readonly<
  Record<TransportKind, Readonly<Record<TransportLanguage, TransportKindLabels>>>
> = {
  modbus_tcp_slave: MODBUS_TCP_SLAVE_LABELS,
};
