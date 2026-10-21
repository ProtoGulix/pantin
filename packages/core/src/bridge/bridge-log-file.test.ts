import { describe, expect, it } from "vitest";
import { createMemoryLogFileSystem } from "../test-support/memory-log-file-system.ts";
import {
  BRIDGE_LOG_MAX_BYTES,
  type BridgeLogFile,
  createBridgeLogFile,
} from "./bridge-log-file.ts";

const TIME = new Date("2026-10-17T10:00:00.000Z");

function setup() {
  const fileSystem = createMemoryLogFileSystem();
  const failures: unknown[] = [];
  const logFile: BridgeLogFile = createBridgeLogFile({
    logsDirectory: "/logs",
    fileSystem,
    now: () => TIME,
    reportWriteFailure: (error) => failures.push(error),
  });
  return { fileSystem, failures, logFile };
}

describe("the bridge log file", () => {
  it("appends core and bridge lines in order, per Pantin", async () => {
    const { logFile, fileSystem } = setup();
    logFile.coreEvent("axis", "modbus_tcp_slave", "info", "Start requested.");
    logFile.bridgeLine("axis", "modbus_tcp_slave", "WARNING refused");
    logFile.bridgeLine("other", "modbus_tcp_slave", "INFO hello");

    expect(await logFile.read("axis", "modbus_tcp_slave")).toBe(
      "2026-10-17T10:00:00.000Z CORE INFO Start requested.\n" +
        "2026-10-17T10:00:00.000Z BRIDGE WARNING refused\n",
    );
    expect(await logFile.read("other", "modbus_tcp_slave")).toContain("BRIDGE INFO hello");
    expect([...fileSystem.files.keys()].sort()).toEqual([
      "/logs/axis/bridge-modbus_tcp_slave.log",
      "/logs/other/bridge-modbus_tcp_slave.log",
    ]);
  });

  it("keeps one file per kind for the same Pantin, and leaves an old bridge.log alone", async () => {
    const { logFile, fileSystem } = setup();
    fileSystem.files.set("/logs/axis/bridge.log", "from before ADR 0065\n");
    logFile.bridgeLine("axis", "modbus_tcp_slave", "INFO modbus");
    logFile.bridgeLine("axis", "opcua_client", "INFO opcua");

    expect(await logFile.read("axis", "opcua_client")).toBe(
      "2026-10-17T10:00:00.000Z BRIDGE INFO opcua\n",
    );
    expect(await logFile.read("axis", "modbus_tcp_slave")).toContain("INFO modbus");
    expect([...fileSystem.files.keys()].sort()).toEqual([
      "/logs/axis/bridge-modbus_tcp_slave.log",
      "/logs/axis/bridge-opcua_client.log",
      "/logs/axis/bridge.log",
    ]);
    expect(fileSystem.files.get("/logs/axis/bridge.log")).toBe("from before ADR 0065\n");
  });

  it("reads an empty text when there is no file", async () => {
    expect(await setup().logFile.read("axis", "modbus_tcp_slave")).toBe("");
  });
});

describe("the bridge log file, rotation and failures", () => {
  it("rotates to bridge-modbus_tcp_slave.log.1 once the file passes 1 MB, replacing the previous one", async () => {
    const { logFile, fileSystem } = setup();
    fileSystem.files.set(
      "/logs/axis/bridge-modbus_tcp_slave.log",
      "x".repeat(BRIDGE_LOG_MAX_BYTES),
    );
    fileSystem.files.set("/logs/axis/bridge-modbus_tcp_slave.log.1", "older");

    logFile.bridgeLine("axis", "modbus_tcp_slave", "first of the new file");
    await logFile.flush();

    expect(fileSystem.files.get("/logs/axis/bridge-modbus_tcp_slave.log.1")).toBe(
      "x".repeat(BRIDGE_LOG_MAX_BYTES),
    );
    expect(fileSystem.files.get("/logs/axis/bridge-modbus_tcp_slave.log")).toBe(
      "2026-10-17T10:00:00.000Z BRIDGE first of the new file\n",
    );
  });

  it("does not rotate under the limit", async () => {
    const { logFile, fileSystem } = setup();
    fileSystem.files.set(
      "/logs/axis/bridge-modbus_tcp_slave.log",
      "x".repeat(BRIDGE_LOG_MAX_BYTES - 1),
    );
    logFile.bridgeLine("axis", "modbus_tcp_slave", "one more");
    await logFile.flush();
    expect(fileSystem.files.has("/logs/axis/bridge-modbus_tcp_slave.log.1")).toBe(false);
  });

  it("reports a failed write once and keeps accepting lines", async () => {
    const { logFile, fileSystem, failures } = setup();
    fileSystem.failAppendsWith = new Error("disk full");
    logFile.bridgeLine("axis", "modbus_tcp_slave", "lost 1");
    logFile.bridgeLine("axis", "modbus_tcp_slave", "lost 2");
    await logFile.flush();
    expect(failures).toEqual([new Error("disk full")]);

    fileSystem.failAppendsWith = undefined;
    logFile.bridgeLine("axis", "modbus_tcp_slave", "kept");
    expect(await logFile.read("axis", "modbus_tcp_slave")).toContain("kept");
    expect(failures).toHaveLength(1);
  });
});
