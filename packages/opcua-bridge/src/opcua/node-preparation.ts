import type { ClientSession } from "node-opcua-client";
import type { Logger } from "../logger.ts";
import type { ModulePlan } from "../module-plan.ts";
import { nodeProblems, unknownNamespaceProblem } from "../node-problems.ts";
import type { FeedbackNode } from "./feedback-writer.ts";
import type { MonitoredCommand } from "./monitoring.ts";
import {
  nodeIdOf,
  type OperationLimits,
  observeNodes,
  readNamespaceArray,
  readOperationLimits,
} from "./node-reader.ts";

// Everything a session must settle before it carries values (ADR 0065 points 2 and 11): the
// namespace index of the module's URI, resolved at each session, then the type and access of
// every node. A problem is one ERROR line, and the module is then `node_mismatch`.

export type PreparedNodes = {
  limits: OperationLimits;
  commands: MonitoredCommand[];
  /** Feedback nodes by tag. */
  feedback: Map<string, Omit<FeedbackNode, "value">>;
};

export type Preparation = { ok: true; nodes: PreparedNodes } | { ok: false };

function logDistinct(log: Logger, module: ModulePlan, problems: readonly string[]): void {
  for (const problem of new Set(problems)) {
    log.error(`Module ${module.key}: ${problem}`);
  }
}

/** Reads the namespace table and the nodes; the problems found are logged, not thrown. */
export async function prepareNodes(
  session: ClientSession,
  module: ModulePlan,
  log: Logger,
): Promise<Preparation> {
  const namespaceArray = await readNamespaceArray(session);
  const namespaceIndex = namespaceArray.indexOf(module.transport.namespaceUri);
  if (namespaceIndex < 0) {
    logDistinct(log, module, [
      unknownNamespaceProblem(module.transport.namespaceUri, namespaceArray),
    ]);
    return { ok: false };
  }
  const limits = await readOperationLimits(session);
  const nodeIds = module.signals.map((signal) => nodeIdOf(namespaceIndex, signal.identifier));
  const observations = await observeNodes(session, nodeIds, limits);
  const problems = module.signals.flatMap((signal, index) => {
    const observation = observations[index];
    return observation === undefined ? [] : nodeProblems(signal, observation);
  });
  if (problems.length > 0) {
    logDistinct(log, module, problems);
    return { ok: false };
  }
  const commands: MonitoredCommand[] = [];
  const feedback = new Map<string, Omit<FeedbackNode, "value">>();
  module.signals.forEach((signal, index) => {
    const nodeId = nodeIds[index] ?? "";
    if (signal.direction === "command") {
      commands.push({ tag: signal.tag, nodeId, iecType: signal.iecType });
    } else {
      feedback.set(signal.tag, { tag: signal.tag, nodeId, iecType: signal.iecType });
    }
  });
  return { ok: true, nodes: { limits, commands, feedback } };
}
