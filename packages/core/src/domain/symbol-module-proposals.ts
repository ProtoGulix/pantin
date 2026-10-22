import type { PlcProjectInfo } from "@pantin/plc-symbol-formats/model";
import type { IoDocument, ModuleProposal } from "@pantin/protocol";
import { OPCUA_CLIENT_KIND } from "@pantin/protocol";

// The NodeId prefix of the OPC UA module a symbol file suggests (ADR 0065 point 12).
// It is a hint to check, never applied by the core: the NodeId may use the runtime name
// instead of the device name of the file (spike 0012).

const MAX_PREFIX_LENGTH = 255;

function prefixOf(project: PlcProjectInfo | null): string | null {
  if (project === null || project.deviceName === "" || project.applicationName === "") {
    return null;
  }
  const prefix = `|var|${project.deviceName}.${project.applicationName}.`;
  return prefix.length > MAX_PREFIX_LENGTH ? null : prefix;
}

/** One proposal per OPC UA module whose prefix is not already the suggested one. */
export function moduleProposalsOf(
  project: PlcProjectInfo | null,
  document: IoDocument,
): ModuleProposal[] {
  const nodeIdPrefix = prefixOf(project);
  if (nodeIdPrefix === null) {
    return [];
  }
  return document.modules.flatMap(({ key, transport }) =>
    transport.kind === OPCUA_CLIENT_KIND && transport.nodeIdPrefix !== nodeIdPrefix
      ? [{ module: key, nodeIdPrefix, reason: "from_project_info" as const }]
      : [],
  );
}
