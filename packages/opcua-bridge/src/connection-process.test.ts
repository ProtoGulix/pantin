import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatusLines, runBridgeProcess } from "./test-support/bridge-process.ts";
import { startFakeCore } from "./test-support/fake-core.ts";
import { startTestPlcServer, type TestPlcServer } from "./test-support/plc-server.ts";
import { opcuaProjection } from "./test-support/projection-fixtures.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// The bridge as the core runs it, against a real server: the first test of ADR 0065 point 1's
// promise that stdout carries status lines only, while node-opcua is actually connecting.

const newFolder = temporaryFolders();

describe("main.ts with a PLC in reach", () => {
  it("connects, tells the core, and still leaves only status lines on stdout", async () => {
    const plc: TestPlcServer = await startTestPlcServer({
      pkiFolder: await newFolder(),
      variables: [
        { name: "plc_extend", dataType: "Boolean" },
        { name: "plc_out", dataType: "Boolean" },
      ],
    });
    const core = await startFakeCore({
      projection: opcuaProjection([
        { key: "plc", port: plc.port, securityMode: "None", securityPolicy: "None" },
      ]),
    });
    try {
      const bridge = runBridgeProcess(
        [
          "--status-lines",
          "--core",
          core.url,
          "--pantin",
          "press",
          "--pki-dir",
          join(await newFolder(), "pki"),
          "--target",
          "plc=127.0.0.1",
        ],
        { stdinText: '{"passwords":{}}\n' },
      );
      await core.nextMessage("plc_status");
      await core.nextMessage("write");
      plc.set("plc_extend", 1);
      await core.untilMessage((message) => JSON.stringify(message).includes('"value":1'));
      bridge.child.kill("SIGTERM");

      expect(await bridge.exited).toBe(0);
      expect(parseStatusLines(bridge.stdout).map((line) => line.event)).toEqual(["ready"]);
      expect(core.received).toContainEqual({
        type: "plc_status",
        module: "plc",
        connected: true,
        reason: null,
      });
      expect(core.received).toContainEqual(
        expect.objectContaining({ type: "write", tag: "press.valve.extend", value: 1 }),
      );
    } finally {
      await core.close();
      await plc.stop();
    }
  }, 30_000);
});
