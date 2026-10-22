import type { OpcuaIecType } from "@pantin/protocol";
import { AttributeIds, type ClientSession } from "node-opcua-client";
import type { Logger } from "../logger.ts";
import { inChunks } from "./node-reader.ts";
import { toVariant } from "./variants.ts";

// Core to PLC (ADR 0065 point 2): the feedback values of a module, written to its nodes. One
// Write per call, split by the server's MaxNodesPerWrite when it declares one.

export type FeedbackNode = { tag: string; nodeId: string; iecType: OpcuaIecType; value: number };

/** Writes every item; a refusal or a failure is logged, never thrown: the next write retries. */
export async function writeFeedback(
  session: ClientSession,
  writes: readonly FeedbackNode[],
  maxNodesPerWrite: number | undefined,
  log: Logger,
): Promise<void> {
  for (const chunk of inChunks(writes, maxNodesPerWrite)) {
    try {
      const results = await session.write(
        chunk.map(({ nodeId, iecType, value }) => ({
          nodeId,
          attributeId: AttributeIds.Value,
          value: { value: toVariant(iecType, value) },
        })),
      );
      chunk.forEach((write, index) => {
        const status = results[index];
        if (status !== undefined && !status.isGood()) {
          log.warning(`The PLC refused the write of ${write.tag}: ${status.name}.`);
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warning(`A write of ${chunk.length} feedback value(s) failed: ${reason}`);
    }
  }
}
