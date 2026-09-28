import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "../http/server.ts";

// A temporary workspace: the pantins directory plus a sentinel file next to it
// that no request may ever read or overwrite.
export type TestWorkspace = {
  root: string;
  pantinsDirectory: string;
  sentinelPath: string;
  remove(): Promise<void>;
};

export const SENTINEL_CONTENT = "sentinel: must never be served";

export async function createTestWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "pantin-core-test-"));
  const pantinsDirectory = join(root, "pantins");
  const sentinelPath = join(root, "sentinel.stl");
  await mkdir(pantinsDirectory);
  await writeFile(sentinelPath, SENTINEL_CONTENT);
  return { root, pantinsDirectory, sentinelPath, remove: () => rm(root, { recursive: true }) };
}

// Unexpected server errors fail the test loudly; rejected sources are
// collected so tests can assert on them.
export function startTestServer(
  pantinsDirectory: string,
  overrides: Partial<PantinServerOptions> = {},
): Promise<RunningPantinServer> {
  return startPantinServer({
    pantinsDirectory,
    port: 0,
    reportError: (error: unknown) => {
      throw new Error(`Unexpected server error in test: ${String(error)}`);
    },
    reportRejectedSource: () => undefined,
    ...overrides,
  });
}

export type RawResponse = {
  status: number;
  contentType: string;
  bytes: Buffer;
  body: string;
  json: unknown;
};

// Sends the path exactly as given: unlike fetch, node:http does not normalise
// "..", which the path traversal tests need.
export function sendRaw(
  server: RunningPantinServer,
  method: string,
  path: string,
  body?: { contentType: string; bytes: Uint8Array },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const headers = body === undefined ? {} : { "content-type": body.contentType };
    const outgoing = httpRequest(
      { host: "127.0.0.1", port: server.address.port, method, path, headers },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          const bytes = Buffer.concat(chunks);
          const text = bytes.toString("utf8");
          const contentType = incoming.headers["content-type"] ?? "";
          const json: unknown = contentType.startsWith("application/json")
            ? JSON.parse(text)
            : undefined;
          resolve({ status: incoming.statusCode ?? 0, contentType, bytes, body: text, json });
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body === undefined ? undefined : Buffer.from(body.bytes));
  });
}

export function sendJsonRequest(
  server: RunningPantinServer,
  method: string,
  path: string,
  value: unknown,
): Promise<RawResponse> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return sendRaw(server, method, path, { contentType: "application/json", bytes });
}

export function importMesh(
  server: RunningPantinServer,
  pantinId: string,
  query: string,
  bytes: Uint8Array,
): Promise<RawResponse> {
  const path = `/api/pantins/${pantinId}/bodies?${query}`;
  return sendRaw(server, "POST", path, { contentType: "application/octet-stream", bytes });
}
