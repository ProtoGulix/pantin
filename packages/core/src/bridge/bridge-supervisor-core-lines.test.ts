import { describe, expect, it } from "vitest";
import { tick, useBridgeBenches } from "../test-support/bridge-bench.ts";

const { runningBridge } = useBridgeBenches();

describe("core lines from the service", () => {
  const LOG = "/logs/axis/bridge.log";

  it("takes core lines from the service while the bridge is supervised, and only then", async () => {
    const { supervisor, spawner, logFiles } = await runningBridge();
    supervisor.logCoreEvent("axis", "error", "PLC write ignored on forced tag a.b.");
    supervisor.logCoreEvent("other", "error", "Not supervised.");
    await supervisor.close();
    spawner.children[0]?.end(0, null);

    const lines = logFiles.files.get(LOG)?.split("\n") ?? [];
    expect(lines).toContain(
      "2026-10-17T10:00:00.000Z CORE ERROR PLC write ignored on forced tag a.b.",
    );
    expect(logFiles.files.has("/logs/other/bridge.log")).toBe(false);
  });

  it("takes no more core lines once the bridge has stopped", async () => {
    const { supervisor, spawner, logFiles } = await runningBridge();
    supervisor.stop("axis");
    spawner.children[0]?.end(0, null);
    await tick();
    supervisor.logCoreEvent("axis", "error", "Too late.");
    await supervisor.close();

    expect(logFiles.files.get(LOG)).not.toContain("Too late.");
  });
});
