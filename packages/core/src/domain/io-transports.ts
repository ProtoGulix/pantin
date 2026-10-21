import type { TransportKind } from "@pantin/protocol";
import { TRANSPORT_PRESENTATION } from "@pantin/transport-types/presentation";
import { TRANSPORT_RULES } from "@pantin/transport-types/rules";

// The one place where the core turns a module's transport into its rules and
// its text (ADR 0064 point 3). Everything else in the core asks here and never
// names a kind, so a new transport changes the registries, not the core.

export function rulesOf(transport: { kind: TransportKind }) {
  return TRANSPORT_RULES[transport.kind];
}

export function presentationOf(transport: { kind: TransportKind }) {
  return TRANSPORT_PRESENTATION[transport.kind];
}
