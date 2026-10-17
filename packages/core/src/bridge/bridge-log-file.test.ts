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
    logFile.coreEvent("axis", "info", "Start requested.");
    logFile.bridgeLine("axis", "WARNING refused");
    logFile.bridgeLine("other", "INFO hello");

    expect(await logFile.read("axis")).toBe(
      "2026-10-17T10:00:00.000Z CORE INFO Start requested.\n" +
        "2026-10-17T10:00:00.000Z BRIDGE WARNING refused\n",
    );
    expect(await logFile.read("other")).toContain("BRIDGE INFO hello");
    expect([...fileSystem.files.keys()].sort()).toEqual([
      "/logs/axis/bridge.log",
      "/logs/other/bridge.log",
    ]);
  });

  it("reads an empty text when there is no file", async () => {
    expect(await setup().logFile.read("axis")).toBe("");
  });
});

describe("the bridge log file, rotation and failures", () => {
  it("rotates to bridge.log.1 once the file passes 1 MB, replacing the previous one", async () => {
    const { logFile, fileSystem } = setup();
    fileSystem.files.set("/logs/axis/bridge.log", "x".repeat(BRIDGE_LOG_MAX_BYTES));
    fileSystem.files.set("/logs/axis/bridge.log.1", "older");

    logFile.bridgeLine("axis", "first of the new file");
    await logFile.flush();

    expect(fileSystem.files.get("/logs/axis/bridge.log.1")).toBe("x".repeat(BRIDGE_LOG_MAX_BYTES));
    expect(fileSystem.files.get("/logs/axis/bridge.log")).toBe(
      "2026-10-17T10:00:00.000Z BRIDGE first of the new file\n",
    );
  });

  it("does not rotate under the limit", async () => {
    const { logFile, fileSystem } = setup();
    fileSystem.files.set("/logs/axis/bridge.log", "x".repeat(BRIDGE_LOG_MAX_BYTES - 1));
    logFile.bridgeLine("axis", "one more");
    await logFile.flush();
    expect(fileSystem.files.has("/logs/axis/bridge.log.1")).toBe(false);
  });

  it("reports a failed write once and keeps accepting lines", async () => {
    const { logFile, fileSystem, failures } = setup();
    fileSystem.failAppendsWith = new Error("disk full");
    logFile.bridgeLine("axis", "lost 1");
    logFile.bridgeLine("axis", "lost 2");
    await logFile.flush();
    expect(failures).toEqual([new Error("disk full")]);

    fileSystem.failAppendsWith = undefined;
    logFile.bridgeLine("axis", "kept");
    expect(await logFile.read("axis")).toContain("kept");
    expect(failures).toHaveLength(1);
  });
});
