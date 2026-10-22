import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { BridgeStatusLineSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { RunningBridge } from "./test-support/bridge-process.ts";
import { startScenario } from "./test-support/bridge-scenario.ts";
import { CLOSED_PORT } from "./test-support/projection-fixtures.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// ADR 0065 point 10: two bridges (two Pantins of one host) share the PKI folder. Both start at
// once on a folder that does not exist yet, so both want to create the certificate.

const newFolder = temporaryFolders();

async function readyCertificateSha256(bridge: RunningBridge): Promise<string> {
  const line = await bridge.waitForStdoutLine((text) => text.includes('"ready"'));
  const ready = BridgeStatusLineSchema.parse(JSON.parse(line));
  if (ready.event !== "ready" || ready.transport !== "opcua_client") {
    throw new Error(`Not an OPC UA ready line: ${line}`);
  }
  return ready.clientCertificate.sha256;
}

describe("two bridges starting at once on one PKI folder", () => {
  it("both start, with the same certificate, and leave one certificate file", async () => {
    const pkiDirectory = join(await newFolder(), "pki");

    const [first, second] = await Promise.all([
      startScenario({ pkiDirectory, port: CLOSED_PORT }),
      startScenario({ pkiDirectory, port: CLOSED_PORT }),
    ]);
    const thumbprints = await Promise.all([
      readyCertificateSha256(first.bridge),
      readyCertificateSha256(second.bridge),
    ]);
    first.bridge.child.kill("SIGTERM");
    second.bridge.child.kill("SIGTERM");

    expect(thumbprints[0]).toBe(thumbprints[1]);
    expect(await Promise.all([first.bridge.exited, second.bridge.exited])).toEqual([0, 0]);
    expect(await readdir(join(pkiDirectory, "own", "certs"))).toEqual(["client_certificate.pem"]);
  }, 60_000);
});
