import type { OpcuaClientTransport } from "./schema.ts";

// How the NodeId of a channel is derived (ADR 0065 point 3). Pure: the core computes it, the
// bridge uses the result without deriving anything.

/**
 * An explicit identifier is `s=<text>` or `i=<digits>`: the two forms a PLC server is known
 * to publish. A NodeId with a guid or an opaque identifier is not offered.
 */
export function isExplicitIdentifierValid(identifier: string): boolean {
  return /^s=.+$/.test(identifier) || /^i=[0-9]+$/.test(identifier);
}

/**
 * The NodeId identifier of a channel. A variable without a dot lives in the GVL Pantin
 * generates, so it is prefixed by `gvlName`; a dotted one already names its GVL or POU.
 */
export function derivedIdentifier(transport: OpcuaClientTransport, variable: string): string {
  const path = variable.includes(".") ? variable : `${transport.gvlName}.${variable}`;
  return `s=${transport.nodeIdPrefix}${path}`;
}

/** The identifier the bridge uses: the explicit one, or the derived one when it is null. */
export function resolvedIdentifier(
  transport: OpcuaClientTransport,
  channel: { variable: string; identifier: string | null },
): string {
  return channel.identifier ?? derivedIdentifier(transport, channel.variable);
}
