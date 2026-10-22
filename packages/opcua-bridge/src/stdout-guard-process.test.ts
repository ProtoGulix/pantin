import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatusLines, runBridgeProcess } from "./test-support/bridge-process.ts";

// ADR 0065 point 1: stdout holds status lines only, whatever writes on it.
describe("the stdout guard in a real process", () => {
  it("keeps console.log, process.stdout.write and node-opcua logging off stdout", async () => {
    const probe = runBridgeProcess([], {
      entry: join(import.meta.dirname, "test-support", "guard-probe.ts"),
    });

    expect(await probe.exited).toBe(0);

    const statusLines = parseStatusLines(probe.stdout);
    expect(statusLines).toHaveLength(1);
    expect(statusLines[0]).toMatchObject({ event: "exiting", message: "probe done" });
    const log = probe.stderr.join("\n");
    expect(log).toContain("noise from console.log");
    expect(log).toContain("noise from process.stdout.write");
    expect(log).toContain("noise from the node-opcua logger");
  }, 30_000);
});
