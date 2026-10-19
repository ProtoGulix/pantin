import type { JointEndpoint, PantinDocument } from "@pantin/protocol";

// The joint form keeps each end in one text field. A body is its id, as
// before ADR 0055; a group is `assembly:<key>`. A body id never holds a colon,
// so the two cannot be confused.

const GROUP_PREFIX = "assembly:";

export function endpointToField(endpoint: JointEndpoint): string {
  return endpoint.kind === "body" ? endpoint.id : `${GROUP_PREFIX}${endpoint.key}`;
}

/** An unknown or empty value becomes a body id the protocol then refuses with its own message. */
export function fieldToEndpoint(value: string): JointEndpoint {
  return value.startsWith(GROUP_PREFIX)
    ? { kind: "assembly", key: value.slice(GROUP_PREFIX.length) }
    : { kind: "body", id: value };
}

type NamedSource = Pick<PantinDocument, "assemblies" | "bodies">;
type Option = { value: string; label: string };

/** Every body, then every assembly as a group: the ends a joint can have. */
export function endpointOptions(
  document: NamedSource,
  groupLabel: (name: string) => string,
): Option[] {
  return [
    ...document.bodies.map((body) => ({ value: body.id, label: body.name })),
    ...document.assemblies.map((assembly) => ({
      value: endpointToField({ kind: "assembly", key: assembly.key }),
      label: groupLabel(assembly.name),
    })),
  ];
}

/** The name shown for an end; the id or key when the document no longer has it. */
export function endpointName(
  document: NamedSource,
  endpoint: JointEndpoint,
  groupLabel: (name: string) => string,
): string {
  if (endpoint.kind === "body") {
    return document.bodies.find((body) => body.id === endpoint.id)?.name ?? endpoint.id;
  }
  const assembly = document.assemblies.find((candidate) => candidate.key === endpoint.key);
  return groupLabel(assembly?.name ?? endpoint.key);
}
