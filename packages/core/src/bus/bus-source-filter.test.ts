import { describe, expect, it } from "vitest";
import { refusedHandshake } from "../test-support/bus-client.ts";
import { createTestWorkspace, startTestServer } from "../test-support/test-server.ts";

// The accept-time filter of ADR 0004 covers the tag bus: it works on the TCP
// connection, so an upgrade from a refused source never gets an HTTP answer.

describe("source filter at accept", () => {
  async function refusalWithAllowList(allow: string[], rejected: string[]) {
    const workspace = await createTestWorkspace();
    const server = await startTestServer(workspace.pantinsDirectory, {
      allow,
      reportRejectedSource: (source) => rejected.push(source),
    });
    try {
      return await refusedHandshake(server);
    } finally {
      await server.close();
      await workspace.remove();
    }
  }

  it("drops a source outside the allow list before any upgrade, and reports it", async () => {
    const rejected: string[] = [];
    expect(await refusalWithAllowList(["10.0.0.0/8"], rejected)).toHaveProperty("error");
    expect(rejected).toEqual(["127.0.0.1"]);
  });

  it("lets an allowed source reach the bus checks (no such Pantin: 404)", async () => {
    const rejected: string[] = [];
    expect(await refusalWithAllowList(["127.0.0.1"], rejected)).toMatchObject({ status: 404 });
    expect(rejected).toEqual([]);
  });
});
