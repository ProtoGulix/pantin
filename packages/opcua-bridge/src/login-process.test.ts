import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { describe, expect, it } from "vitest";
import { exitingLineOf, startScenario } from "./test-support/bridge-scenario.ts";
import { startTestPlcServer } from "./test-support/plc-server.ts";
import { SECURE_MODULE, SECURE_SERVER } from "./test-support/secure-plc.ts";
import { createTestPki } from "./test-support/session-harness.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// ADR 0065 point 9: a refused login ends the whole bridge, so the core forgets that module's
// password and asks for it again. The password never reaches an output.

const newFolder = temporaryFolders();
const WRONG_PASSWORD = "wrong-marker-pw-31";

async function setUpServerWithUsers() {
  const pki = await createTestPki(hostname());
  const plc = await startTestPlcServer({
    ...SECURE_SERVER,
    pkiFolder: await newFolder(),
    users: { operator: "s3cret-pw" },
  });
  await plc.trustClient(await readFile(pki.certificateFile));
  await pki.certificateManager.trustCertificate(plc.certificateDer());
  return { plc, pkiDirectory: pki.certificateManager.rootDir };
}

describe("a login the PLC refuses", () => {
  it("ends the bridge with authentication_failed for the module, without the password", async () => {
    const { plc, pkiDirectory } = await setUpServerWithUsers();

    const run = await startScenario({
      pkiDirectory,
      port: plc.port,
      module: { ...SECURE_MODULE, userName: "operator" },
      password: WRONG_PASSWORD,
    });

    expect(await run.bridge.exited).toBe(1);
    expect(exitingLineOf(run.bridge)).toMatchObject({
      kind: "authentication_failed",
      module: "plc",
      certificate: null,
      message: expect.stringContaining("user name or password"),
    });
    const outputs = [...run.bridge.stdout, ...run.bridge.stderr].join("\n");
    expect(outputs).not.toContain(WRONG_PASSWORD);
  }, 30_000);

  it("ends the bridge the same way when the PLC accepts no anonymous access", async () => {
    const { plc, pkiDirectory } = await setUpServerWithUsers();

    const run = await startScenario({ pkiDirectory, port: plc.port, module: SECURE_MODULE });

    expect(await run.bridge.exited).toBe(1);
    expect(exitingLineOf(run.bridge)).toMatchObject({
      kind: "authentication_failed",
      module: "plc",
      message: expect.stringContaining("anonymous"),
    });
  }, 30_000);
});
