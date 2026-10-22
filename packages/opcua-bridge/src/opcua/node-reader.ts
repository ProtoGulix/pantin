import { AttributeIds, type ClientSession, VariableIds } from "node-opcua-client";
import type { NodeObservation } from "../node-problems.ts";
import { dataTypeNameOf } from "./variants.ts";

// What the bridge reads from the server before it trusts a session (ADR 0065 point 11): the
// namespace table, the operation limits, and the type and access of every node.

/** `undefined` means the server declares no limit (a value of 0, or no such node). */
export type OperationLimits = {
  maxNodesPerRead: number | undefined;
  maxNodesPerWrite: number | undefined;
};

export function nodeIdOf(namespaceIndex: number, identifier: string): string {
  return `ns=${namespaceIndex};${identifier}`;
}

export async function readNamespaceArray(session: ClientSession): Promise<string[]> {
  return session.readNamespaceArray();
}

function limitOf(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

// NOT VERIFIED on CODESYS: it may not publish these nodes, then the answer is "no limit" and a
// refused request surfaces as a write error in the log.
export async function readOperationLimits(session: ClientSession): Promise<OperationLimits> {
  const [read, write] = await session.read([
    {
      nodeId: VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerRead,
      attributeId: AttributeIds.Value,
    },
    {
      nodeId: VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerWrite,
      attributeId: AttributeIds.Value,
    },
  ]);
  return {
    maxNodesPerRead: limitOf(read?.value.value),
    maxNodesPerWrite: limitOf(write?.value.value),
  };
}

export function inChunks<T>(items: readonly T[], size: number | undefined): T[][] {
  const chunkSize = size ?? Math.max(items.length, 1);
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    chunks.push(items.slice(start, start + chunkSize));
  }
  return chunks;
}

async function observeChunk(
  session: ClientSession,
  nodeIds: readonly string[],
): Promise<NodeObservation[]> {
  const reads = nodeIds.flatMap((nodeId) => [
    { nodeId, attributeId: AttributeIds.DataType },
    { nodeId, attributeId: AttributeIds.UserAccessLevel },
  ]);
  const results = await session.read(reads);
  return nodeIds.map((_, index) => {
    const dataType = results[2 * index];
    const access = results[2 * index + 1];
    // A missing node answers BadNodeIdUnknown on both attributes.
    if (dataType === undefined || !dataType.statusCode.isGood()) {
      return { dataType: null, userAccessLevel: 0 };
    }
    const id: unknown = dataType.value.value?.value; // a NodeId; namespace 0 numeric ids are the types
    return {
      dataType: typeof id === "number" ? dataTypeNameOf(id) : "other",
      userAccessLevel: typeof access?.value.value === "number" ? access.value.value : 0,
    };
  });
}

/** One observation per node id, in the same order. */
export async function observeNodes(
  session: ClientSession,
  nodeIds: readonly string[],
  limits: OperationLimits,
): Promise<NodeObservation[]> {
  // Two attributes per node: a chunk of N nodes is 2N read operations.
  const nodesPerChunk =
    limits.maxNodesPerRead === undefined ? undefined : Math.floor(limits.maxNodesPerRead / 2) || 1;
  const observed: NodeObservation[] = [];
  for (const chunk of inChunks(nodeIds, nodesPerChunk)) {
    observed.push(...(await observeChunk(session, chunk)));
  }
  return observed;
}
