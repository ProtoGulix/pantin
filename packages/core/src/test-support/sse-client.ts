import { request as httpRequest, type IncomingMessage } from "node:http";
import { type PoseSnapshot, PoseSnapshotSchema } from "@pantin/protocol";

// A minimal Server-Sent Events reader over node:http, for the stream tests.
export type SseClient = {
  status: number;
  headers: IncomingMessage["headers"];
  snapshots: PoseSnapshot[];
  comments: string[];
  // Resolves once the predicate holds; re-checked as data arrives.
  waitUntil(predicate: () => boolean): Promise<void>;
  ended(): Promise<void>;
  close(): void;
};

function parseBlock(client: Pick<SseClient, "snapshots" | "comments">, block: string): void {
  if (block.startsWith(":")) {
    client.comments.push(block);
    return;
  }
  const data = block
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  if (block.startsWith("event: pose\n") && data !== undefined) {
    client.snapshots.push(PoseSnapshotSchema.parse(JSON.parse(data)));
  }
}

// Wakes the waiters whose predicate now holds.
function createWaiters() {
  const waiters: Array<() => boolean> = [];
  return {
    until: (predicate: () => boolean) =>
      new Promise<void>((done) => {
        const check = () => {
          const holds = predicate();
          if (holds) {
            done();
          }
          return holds;
        };
        if (!check()) {
          waiters.push(check);
        }
      }),
    wake: () => {
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (waiters[index]?.()) {
          waiters.splice(index, 1);
        }
      }
    },
  };
}

function readEvents(incoming: IncomingMessage, close: () => void): SseClient {
  const { until, wake } = createWaiters();
  let buffer = "";
  let isEnded = false;
  const client: SseClient = {
    status: incoming.statusCode ?? 0,
    headers: incoming.headers,
    snapshots: [],
    comments: [],
    waitUntil: until,
    ended: () => until(() => isEnded),
    close,
  };
  incoming.setEncoding("utf8");
  incoming.on("data", (chunk: string) => {
    buffer += chunk;
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      parseBlock(client, block);
    }
    wake();
  });
  const finish = () => {
    isEnded = true;
    wake();
  };
  incoming.on("end", finish);
  incoming.on("close", finish);
  incoming.on("error", finish);
  return client;
}

export function openSse(port: number, path: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const options = { host: "127.0.0.1", port, method: "GET", path };
    const outgoing = httpRequest(options, (incoming) =>
      resolve(readEvents(incoming, () => outgoing.destroy())),
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}
