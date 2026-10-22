import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseStatusLines, runBridgeProcess } from "./test-support/bridge-process.ts";
import { startFakeCore } from "./test-support/fake-core.ts";
import { CLOSED_PORT, opcuaProjection } from "./test-support/projection-fixtures.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

// The real entry file, run as the core runs it, against a core reduced to its HTTP and bus.

const newFolder = temporaryFolders();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const MARKER = "marker-password-9f3a";

async function setup(projection = opcuaProjection([{ key: "plc", port: CLOSED_PORT }])) {
  const core = await startFakeCore({ projection });
  cleanups.push(() => core.close());
  const pkiDirectory = join(await newFolder(), "pki");
  const args = [
    "--status-lines",
    "--core",
    core.url,
    "--pantin",
    "press",
    "--pki-dir",
    pkiDirectory,
    "--target",
    "plc=127.0.0.1",
  ];
  return { core, pkiDirectory, args };
}

describe("main.ts as a process", () => {
  it("writes one ready line on stdout and exits 0 on SIGTERM without an exiting line", async () => {
    const { core, pkiDirectory, args } = await setup();
    const bridge = runBridgeProcess(args, { stdinText: '{"passwords":{}}\n' });

    const readyLine = await bridge.waitForStdoutLine((line) => line.includes('"ready"'));
    expect(await core.nextMessage("hello")).toMatchObject({ transport: "opcua_client" });
    bridge.child.kill("SIGTERM");

    expect(await bridge.exited).toBe(0);
    const lines = parseStatusLines(bridge.stdout);
    expect(lines).toHaveLength(1);
    const certificate = await readFile(
      join(pkiDirectory, "own", "certs", "client_certificate.pem"),
    );
    expect(JSON.parse(readyLine)).toMatchObject({
      transport: "opcua_client",
      modules: [{ key: "plc", endpoint: "opc.tcp://127.0.0.1:1" }],
      clientCertificate: { applicationUri: expect.stringMatching(/^urn:pantin:.+:opcua-bridge$/) },
    });
    expect(certificate.length).toBeGreaterThan(0);
  }, 30_000);

  it("exits 0 on SIGTERM before it served, with nothing on stdout", async () => {
    const { args } = await setup();
    // The passwords line never comes: the bridge waits for it, before the PKI and the core.
    const bridge = runBridgeProcess(args, { keepStdinOpen: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    bridge.child.kill("SIGTERM");

    expect(await bridge.exited).toBe(0);
    expect(bridge.stdout).toEqual([]);
  }, 30_000);

  it("leaves only status lines on stdout when the core ends the bus", async () => {
    const { core, args } = await setup();
    const bridge = runBridgeProcess(args, { stdinText: '{"passwords":{}}\n' });
    await bridge.waitForStdoutLine((line) => line.includes('"ready"'));

    core.send({ type: "io_changed" });

    expect(await bridge.exited).toBe(1);
    const lines = parseStatusLines(bridge.stdout);
    expect(lines.map((line) => line.event)).toEqual(["ready", "exiting"]);
    expect(lines[1]).toMatchObject({ kind: "mapping_changed" });
  }, 30_000);

  it("exits configuration on a host name target, with a line on stdout and the message on stderr", async () => {
    const { args } = await setup();
    const bridge = runBridgeProcess([...args.slice(0, -1), "plc=plc.example.com"], {
      stdinText: '{"passwords":{}}\n',
    });

    expect(await bridge.exited).toBe(2);
    expect(parseStatusLines(bridge.stdout)).toEqual([
      expect.objectContaining({ event: "exiting", kind: "configuration" }),
    ]);
    expect(bridge.stderr.join("\n")).toMatch(/host name/i);
  }, 30_000);

  it("refuses a user module on a terminal run and never reads stdin there", async () => {
    const { args } = await setup(
      opcuaProjection([{ key: "plc", userName: "operator", port: CLOSED_PORT }]),
    );
    const terminalArgs = args.filter((argument) => argument !== "--status-lines");
    const bridge = runBridgeProcess(terminalArgs, {
      stdinText: JSON.stringify({ passwords: { plc: MARKER } }),
    });

    expect(await bridge.exited).toBe(2);
    expect(bridge.stdout).toEqual([]);
    expect(bridge.stderr.join("\n")).toMatch(/Start it from the viewer/);
  }, 30_000);

  it("takes the password from stdin and writes it nowhere", async () => {
    const { args } = await setup(
      opcuaProjection([{ key: "plc", userName: "operator", port: CLOSED_PORT }]),
    );
    const bridge = runBridgeProcess(args, {
      stdinText: `${JSON.stringify({ passwords: { plc: MARKER } })}\n`,
    });

    await bridge.waitForStdoutLine((line) => line.includes('"ready"'));
    bridge.child.kill("SIGTERM");

    expect(await bridge.exited).toBe(0);
    expect(bridge.stdout.join("\n")).not.toContain(MARKER);
    expect(bridge.stderr.join("\n")).not.toContain(MARKER);
  }, 30_000);

  it("writes nothing to the home directory: the PKI is the folder it was given", async () => {
    const { args } = await setup();
    const home = await newFolder();
    const bridge = runBridgeProcess(args, { stdinText: '{"passwords":{}}\n', home });

    await bridge.waitForStdoutLine((line) => line.includes('"ready"'));
    bridge.child.kill("SIGTERM");
    await bridge.exited;

    await expect(stat(join(home, ".config"))).rejects.toThrow(/ENOENT/);
  }, 30_000);
});
