import type { Logger } from "../logger.ts";
import type { Connection } from "./connection.ts";
import { type FeedbackNode, writeFeedback } from "./feedback-writer.ts";
import type { PreparedNodes } from "./node-preparation.ts";

/** The writes of a module's feedback, one after the other, so that their order is kept. */
export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly connection: Connection;
  private readonly nodes: PreparedNodes;
  private readonly context: { log: Logger; feedbackValues: ReadonlyMap<string, number> };

  constructor(
    connection: Connection,
    nodes: PreparedNodes,
    context: { log: Logger; feedbackValues: ReadonlyMap<string, number> },
  ) {
    this.connection = connection;
    this.nodes = nodes;
    this.context = context;
  }

  enqueue(tags: readonly string[] | "all"): void {
    const names = tags === "all" ? [...this.nodes.feedback.keys()] : tags;
    this.tail = this.tail.then(() => this.writeLatest(names));
  }

  // Values are read when the write runs, so a burst of messages writes the latest ones.
  private writeLatest(names: readonly string[]): Promise<void> | undefined {
    const writes = names.flatMap((tag): FeedbackNode[] => {
      const node = this.nodes.feedback.get(tag);
      const value = this.context.feedbackValues.get(tag);
      return node === undefined || value === undefined ? [] : [{ ...node, value }];
    });
    return writes.length === 0
      ? undefined
      : writeFeedback(
          this.connection.session,
          writes,
          this.nodes.limits.maxNodesPerWrite,
          this.context.log,
        );
  }
}
