import type { PantinDocument } from "@pantin/protocol";
import { parseNodeId } from "../tree/node-ids.ts";

// What "Grouper…" and "Dégrouper" act on (ADR 0055 points 6, 7 and 12), as
// pure functions of the document and the selected rows. The core checks the
// rest and refuses with its own sentence.

/** The members of a group to make, all direct children of one assembly. */
export interface GroupingTarget {
  pantinId: string;
  // The assembly the members sit in (the group becomes its child).
  assemblyKey: string;
  bodies: string[];
  assemblies: string[];
}

/** A grouping waiting for the user to name the group and confirm. */
export interface PendingGroup {
  target: GroupingTarget;
  name: string;
}

interface Member {
  bodyId: string | null;
  assemblyKey: string | null;
  // The assembly the member is a direct child of.
  holder: string | undefined;
}

function memberOf(document: PantinDocument, pantinId: string, nodeId: string): Member | null {
  const ref = parseNodeId(nodeId);
  if (ref === null || ref.pantinId !== pantinId) {
    return null;
  }
  if (ref.kind === "body") {
    const body = document.bodies.find((candidate) => candidate.id === ref.bodyId);
    return body === undefined
      ? null
      : { bodyId: body.id, assemblyKey: null, holder: body.assembly };
  }
  if (ref.kind === "assembly") {
    const assembly = document.assemblies.find((candidate) => candidate.key === ref.key);
    return assembly === undefined
      ? null
      : { bodyId: null, assemblyKey: assembly.key, holder: assembly.parent };
  }
  return null;
}

/**
 * The grouping the selected rows ask for: body rows and group rows under the
 * same assembly. Null when a row is anything else, rows sit in different
 * assemblies, or a group row is top level (a Pantin is not an assembly).
 */
export function groupingTargetOf(
  document: PantinDocument,
  pantinId: string,
  nodeIds: readonly string[],
): GroupingTarget | null {
  const members = nodeIds.map((nodeId) => memberOf(document, pantinId, nodeId));
  const [first] = members;
  if (first === undefined || first === null || first.holder === undefined) {
    return null;
  }
  const holder = first.holder;
  if (!members.every((member) => member !== null && member.holder === holder)) {
    return null;
  }
  return {
    pantinId,
    assemblyKey: holder,
    bodies: members.flatMap((member) => (member?.bodyId ? [member.bodyId] : [])),
    assemblies: members.flatMap((member) => (member?.assemblyKey ? [member.assemblyKey] : [])),
  };
}

/** The group a row can be dissolved from: an assembly that has a structure parent. */
export function ungroupTargetOf(
  document: PantinDocument,
  pantinId: string,
  nodeId: string | null,
): { pantinId: string; key: string; name: string } | null {
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  if (ref?.kind !== "assembly" || ref.pantinId !== pantinId) {
    return null;
  }
  const assembly = document.assemblies.find((candidate) => candidate.key === ref.key);
  return assembly?.parent === undefined
    ? null
    : { pantinId, key: assembly.key, name: assembly.name };
}
