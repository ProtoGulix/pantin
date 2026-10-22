import { describe, expect, it } from "vitest";
import { startScenario } from "./test-support/bridge-scenario.ts";
import { startTestPlcServer } from "./test-support/plc-server.ts";
import { socketInodesOf, systemListeningInodes } from "./test-support/proc-sockets.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// ADR 0065 points 8 and 14: the bridge only dials out. While it is connected, none of the
// sockets it holds is a listening one. Reads /proc, so Linux only.

const newFolder = temporaryFolders();

describe.skipIf(process.platform !== "linux")(
  "the bridge process (Linux only: reads /proc)",
  () => {
    it("holds connections but listens on no socket while connected to a PLC", async () => {
      const plc = await startTestPlcServer({
        pkiFolder: await newFolder(),
        variables: [
          { name: "plc_extend", dataType: "Boolean" },
          { name: "plc_out", dataType: "Boolean" },
        ],
      });
      try {
        const run = await startScenario({
          pkiDirectory: `${await newFolder()}/pki`,
          port: plc.port,
          module: { securityMode: "None", securityPolicy: "None" },
        });
        await run.core.untilMessage(
          (message) =>
            JSON.stringify(message).includes('"type":"plc_status"') &&
            JSON.stringify(message).includes('"connected":true'),
        );
        const pid = run.bridge.child.pid ?? 0;

        const held = await socketInodesOf(pid);
        const listening = new Set(await systemListeningInodes());

        // The bus to the core and the session to the PLC are sockets it does hold.
        expect(held.length).toBeGreaterThanOrEqual(2);
        expect(held.filter((inode) => listening.has(inode))).toEqual([]);
      } finally {
        await plc.stop();
      }
    }, 30_000);
  },
);
