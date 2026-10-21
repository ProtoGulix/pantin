import type { TransportChannel, TransportConfig, TransportKind } from "./schemas.ts";

// The contract of a transport's presentation (ADR 0064 point 3): pure text for the
// CSV export, the GVL and the viewer. English only; the user's language is the
// business of labels.ts.

export interface TransportPresentation {
  kind: TransportKind;
  /** The transport's name, for the CSV `transport` cell. */
  transportText(transport: TransportConfig): string;
  /** Where a PLC reaches the module, for the CSV `endpoint` cell and a heading subtitle. */
  endpointText(transport: TransportConfig): string;
  /** Where a channel sits in the module, for the CSV `address` cell and the GVL comment. */
  addressText(channel: TransportChannel): string;
  /** The PLC-side type of a channel, for the CSV `PLC type` cell and the GVL declaration. */
  plcTypeText(channel: TransportChannel): string;
}
