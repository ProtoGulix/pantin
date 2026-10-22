import { chmod, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type BridgeStatusLine, BridgeStatusLineSchema } from "@pantin/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { deferred } from "./deferred.ts";
import { type RunEnvironment, runBridge } from "./run.ts";
import { type FakeCore, startFakeCore } from "./test-support/fake-core.ts";
import { CLOSED_PORT, opcuaProjection } from "./test-support/projection-fixtures.ts";
import { temporaryFolders } from "./test-support/temporary-folder.ts";

const newFolder = temporaryFolders();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const MARKER = "marker-password-9f3a";

type Harness = {
  environment: RunEnvironment;
  statusLines: BridgeStatusLine[];
  logLines: string[];
  terminate(): void;
  core: FakeCore;
  pkiDirectory: string;
};

async function harness(
  options: {
    projection?: ReturnType<typeof opcuaProjection>;
    args?: string[];
    stdin?: string;
    coreUrl?: string;
    refuseHelloWith?: { code: number; reason: string };
  } = {},
): Promise<Harness> {
  const core = await startFakeCore({
    projection: options.projection ?? opcuaProjection([{ key: "plc", port: CLOSED_PORT }]),
    ...(options.refuseHelloWith === undefined ? {} : { refuseHelloWith: options.refuseHelloWith }),
  });
  cleanups.push(() => core.close());
  const pkiDirectory = join(await newFolder(), "pki");
  const statusLines: BridgeStatusLine[] = [];
  const logLines: string[] = [];
  const terminated = deferred<void>();
  const environment: RunEnvironment = {
    argv: options.args ?? [
      "--status-lines",
      "--core",
      options.coreUrl ?? core.url,
      "--pantin",
      "press",
      "--pki-dir",
      pkiDirectory,
      "--target",
      "plc=127.0.0.1",
    ],
    stdin: (async function* () {
      yield options.stdin ?? '{"passwords":{}}\n';
    })(),
    fetcher: fetch,
    hostname: "workshop",
    platform: "linux",
    fileSystem: { mkdir, chmod, stat, readFile, readdir, link, rm },
    writeStatusLine: async (line) => {
      statusLines.push(BridgeStatusLineSchema.parse(JSON.parse(line)));
    },
    log: {
      debug: (message) => logLines.push(message),
      info: (message) => logLines.push(message),
      warning: (message) => logLines.push(message),
      error: (message) => logLines.push(message),
    },
    terminated: terminated.promise,
  };
  return {
    environment,
    statusLines,
    logLines,
    terminate: () => terminated.resolve(),
    core,
    pkiDirectory,
  };
}

async function untilReady(run: Harness): Promise<void> {
  while (!run.statusLines.some((line) => line.event === "ready")) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("runBridge", () => {
  it("writes ready after the welcome and stops with 0 and no exiting line on SIGTERM", async () => {
    const run = await harness();
    const exitCode = runBridge(run.environment);

    await untilReady(run);
    expect(await run.core.nextMessage("hello")).toMatchObject({
      role: "plc",
      transport: "opcua_client",
    });
    expect(await run.core.nextMessage("subscribe")).toEqual({
      type: "subscribe",
      tags: ["press.cylinder.extended"],
    });
    run.terminate();

    expect(await exitCode).toBe(0);
    expect(run.statusLines).toHaveLength(1);
    const ready = run.statusLines[0];
    expect(ready).toMatchObject({
      event: "ready",
      transport: "opcua_client",
      modules: [{ key: "plc", endpoint: "opc.tcp://127.0.0.1:1" }],
      clientCertificate: { applicationUri: "urn:pantin:workshop:opcua-bridge" },
    });
    expect(run.core.ioRequestUrls).toEqual(["/api/pantins/press/io?transport=opcua_client"]);
  }, 30_000);

  it("exits mapping_changed on io_changed", async () => {
    const run = await harness();
    const exitCode = runBridge(run.environment);
    await untilReady(run);

    run.core.send({ type: "io_changed" });

    expect(await exitCode).toBe(1);
    expect(run.statusLines.at(-1)).toMatchObject({ event: "exiting", kind: "mapping_changed" });
  }, 30_000);

  it("exits bus_closed when the core closes the bus", async () => {
    const run = await harness();
    const exitCode = runBridge(run.environment);
    await untilReady(run);

    run.core.closeBus(1000, "bye");

    expect(await exitCode).toBe(1);
    expect(run.statusLines.at(-1)).toMatchObject({ event: "exiting", kind: "bus_closed" });
  }, 30_000);

  it("exits bus_closed, before any ready line, when the core refuses the hello", async () => {
    const run = await harness({ refuseHelloWith: { code: 4003, reason: "mismatch" } });

    expect(await runBridge(run.environment)).toBe(1);
    expect(run.statusLines).toEqual([
      expect.objectContaining({ event: "exiting", kind: "bus_closed" }),
    ]);
  }, 30_000);

  it("stops with 0 and no exiting line on SIGTERM while it still waits for the passwords", async () => {
    const run = await harness();
    const waitingStdin = (async function* () {
      await new Promise<never>(() => undefined);
      yield "";
    })();
    const exitCode = runBridge({ ...run.environment, stdin: waitingStdin });

    run.terminate();

    expect(await exitCode).toBe(0);
    expect(run.statusLines).toEqual([]);
    expect(run.logLines).toEqual([]);
  }, 30_000);

  it("stops with 0 on SIGTERM while it waits for the core's welcome", async () => {
    const run = await harness();
    const silent = await startFakeCore({
      projection: opcuaProjection([{ key: "plc", port: CLOSED_PORT }]),
      silentOnHello: true,
    });
    cleanups.push(() => silent.close());
    const argv = run.environment.argv.map((argument) =>
      argument === run.core.url ? silent.url : argument,
    );
    const exitCode = runBridge({ ...run.environment, argv });

    await silent.nextMessage("hello");
    run.terminate();

    expect(await exitCode).toBe(0);
    expect(run.statusLines).toEqual([]);
  }, 30_000);

  it("exits mapping_not_valid without opening the bus", async () => {
    const run = await harness({
      projection: opcuaProjection(undefined, { status: "missing", mappingId: null }),
    });

    expect(await runBridge(run.environment)).toBe(1);
    expect(run.statusLines).toEqual([
      expect.objectContaining({ event: "exiting", kind: "mapping_not_valid" }),
    ]);
    expect(run.core.received).toEqual([]);
  }, 30_000);

  it("exits core_unavailable when the core is not there", async () => {
    const run = await harness({ coreUrl: "http://127.0.0.1:1" });

    expect(await runBridge(run.environment)).toBe(1);
    expect(run.statusLines).toEqual([
      expect.objectContaining({ event: "exiting", kind: "core_unavailable" }),
    ]);
  }, 30_000);

  it("exits configuration with 2 on a refused target, and says so under --status-lines", async () => {
    const run = await harness();
    const environment = {
      ...run.environment,
      argv: [...run.environment.argv.slice(0, -1), "plc=plc.example.com"],
    };

    expect(await runBridge(environment)).toBe(2);
    expect(run.statusLines).toEqual([
      expect.objectContaining({ event: "exiting", kind: "configuration" }),
    ]);
    expect(run.core.ioRequestUrls).toEqual([]);
  });

  it("writes no status line without --status-lines, and reads no stdin", async () => {
    const run = await harness({ stdin: "not json at all" });
    const argv = run.environment.argv.filter((argument) => argument !== "--status-lines");
    const exitCode = runBridge({ ...run.environment, argv });
    await run.core.nextMessage("subscribe");
    run.terminate();

    expect(await exitCode).toBe(0);
    expect(run.statusLines).toEqual([]);
  }, 30_000);

  it("exits configuration for a user module on a terminal run: start it from the viewer", async () => {
    const run = await harness({
      projection: opcuaProjection([{ key: "plc", userName: "operator", port: CLOSED_PORT }]),
    });
    const argv = run.environment.argv.filter((argument) => argument !== "--status-lines");

    expect(await runBridge({ ...run.environment, argv })).toBe(2);
    expect(run.logLines.join("\n")).toMatch(/Start it from the viewer/);
  }, 30_000);

  it("never writes a password in the log or in a status line", async () => {
    const run = await harness({
      projection: opcuaProjection([{ key: "plc", userName: "operator", port: CLOSED_PORT }]),
      stdin: JSON.stringify({ passwords: { plc: MARKER } }),
    });
    const exitCode = runBridge(run.environment);
    await untilReady(run);
    run.terminate();
    await exitCode;

    expect(JSON.stringify(run.statusLines)).not.toContain(MARKER);
    expect(run.logLines.join("\n")).not.toContain(MARKER);
  }, 30_000);

  it("exits configuration when the PKI folder cannot be made private", async () => {
    const run = await harness();
    const environment: RunEnvironment = {
      ...run.environment,
      fileSystem: {
        ...run.environment.fileSystem,
        chmod: () => Promise.reject(new Error("EPERM")),
      },
    };

    expect(await runBridge(environment)).toBe(2);
    expect(run.statusLines).toEqual([
      expect.objectContaining({
        kind: "configuration",
        message: expect.stringContaining("PKI folder"),
      }),
    ]);
  });
});
