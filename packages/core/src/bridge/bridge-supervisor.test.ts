import type { BridgeStatus } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { LOCAL, PYTHON, READY, tick, useBridgeBenches } from "../test-support/bridge-bench.ts";

const { started, runningBridge } = useBridgeBenches();

describe("starting a bridge", () => {
  it("spawns the fixed command as an argument array without a shell", async () => {
    const { supervisor, spawner } = started();
    const status = await supervisor.start("axis", {
      listen: "192.168.1.20",
      allow: ["192.168.1.0/24"],
    });
    expect(status.state).toBe("starting");
    expect(spawner.calls).toEqual([
      {
        command: PYTHON,
        args: [
          "-I",
          "-u",
          "-m",
          "pantin_bridge",
          "--status-lines",
          "--core",
          "http://127.0.0.1:4800",
          "--pantin",
          "axis",
          "--listen",
          "192.168.1.20",
          "--allow",
          "192.168.1.0/24",
        ],
        options: { stdio: ["ignore", "pipe", "pipe"], shell: false },
      },
    ]);
    expect(status.network).toEqual({ listen: "192.168.1.20", allow: ["192.168.1.0/24"] });
  });

  it("answers bridge_unavailable, and says so in the status, without a Python", async () => {
    const { supervisor } = started({ pythonPath: null });
    expect(supervisor.status("axis").availability).toBe("unavailable");
    const error = await supervisor.start("axis", LOCAL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("bridge_unavailable");
  });
});

describe("a running bridge", () => {
  it("is running once the ready line arrives, with the PLC state of each module", async () => {
    const { supervisor, busFacts, changes } = await runningBridge();
    let status: BridgeStatus = supervisor.status("axis");
    expect(status.state).toBe("running");
    expect(status.modules).toEqual([{ key: "m1", port: 1502, plcConnected: false }]);
    busFacts.plcConnectedModules.add("m1");
    supervisor.refresh("axis");
    status = supervisor.status("axis");
    expect(status.modules[0]?.plcConnected).toBe(true);
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a second start while one is under way", async () => {
    const { supervisor } = started();
    await supervisor.start("axis", LOCAL);
    await expect(supervisor.start("axis", LOCAL)).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses a port another Pantin's bridge holds", async () => {
    const { supervisor } = started();
    await supervisor.start("axis", LOCAL);
    await expect(supervisor.start("other", LOCAL)).rejects.toThrow("Pantin axis");
  });
});

describe("a bridge that cannot start", () => {
  it("fails with spawn_failed when the interpreter cannot be run", async () => {
    const { supervisor, spawner, failures } = started();
    await supervisor.start("axis", LOCAL);
    spawner.children[0]?.failToStart(new Error("spawn ENOENT"));
    await tick();
    const status = supervisor.status("axis");
    expect(status.state).toBe("failed");
    expect(status.failure?.kind).toBe("spawn_failed");
    expect(status.failure?.message).toContain("pnpm setup:python");
    expect(failures).toHaveLength(1);
  });

  it("fails with start_timeout and stops a child that never says ready", async () => {
    const { supervisor, spawner } = started({ timeoutMs: 30 });
    await supervisor.start("axis", LOCAL);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(supervisor.status("axis").failure?.kind).toBe("start_timeout");
    expect(spawner.children[0]?.signals).toContain("SIGTERM");
  });
});

describe("a bridge that ends by itself", () => {
  it("fails with the kind and message of its exiting line", async () => {
    const { supervisor, spawner, failures } = await runningBridge();
    const line = { event: "exiting", kind: "mapping_changed", message: "Restart the bridge." };
    spawner.children[0]?.writeStdout(`${JSON.stringify(line)}\n`);
    await tick();
    spawner.children[0]?.end(1, null);
    await tick();
    const status = supervisor.status("axis");
    expect(status.state).toBe("failed");
    expect(status.failure).toEqual({
      kind: "mapping_changed",
      message: "Restart the bridge.",
      exitCode: 1,
      signal: null,
    });
    expect(status.modules).toEqual([]);
    expect(failures).toEqual([status.failure]);
  });

  it("fails with crashed when it said nothing", async () => {
    const { supervisor, spawner } = await runningBridge();
    spawner.children[0]?.end(null, "SIGKILL");
    await tick();
    expect(supervisor.status("axis").failure).toMatchObject({ kind: "crashed", signal: "SIGKILL" });
  });

  it("restarts after a failure, and ignores the late exit of the old child", async () => {
    const { supervisor, spawner } = started({ exitsOnSigterm: false, timeoutMs: 30 });
    await supervisor.start("axis", LOCAL);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(supervisor.status("axis").state).toBe("failed");
    await supervisor.start("axis", LOCAL);
    spawner.children[0]?.end(1, null);
    await tick();
    expect(supervisor.status("axis").state).toBe("starting");
  });
});

describe("stopping a bridge", () => {
  it("sends SIGTERM and ends stopped", async () => {
    const { supervisor, spawner } = await runningBridge();
    const child = spawner.children[0];
    expect(supervisor.stop("axis").state).toBe("stopped");
    expect(child?.signals).toEqual(["SIGTERM"]);
  });

  it("ends stopped, not failed, when the child had to be killed after the grace delay", async () => {
    const { supervisor, spawner, failures } = started({ exitsOnSigterm: false });
    await supervisor.start("axis", LOCAL);
    spawner.children[0]?.writeStdout(`${READY}\n`);
    await tick();
    expect(supervisor.stop("axis").state).toBe("stopping");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(spawner.children[0]?.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(supervisor.status("axis").state).toBe("stopped");
    expect(supervisor.status("axis").failure).toBeNull();
    expect(failures).toEqual([]);
  });

  it("answers the current state when there is nothing to stop", () => {
    const { supervisor } = started();
    expect(supervisor.stop("axis").state).toBe("stopped");
  });

  it("close stops every child and waits for them", async () => {
    const { supervisor, spawner } = await runningBridge();
    await supervisor.close();
    expect(spawner.children[0]?.signals).toContain("SIGTERM");
    expect(supervisor.status("axis").state).toBe("stopped");
  });
});

describe("the bridge's output", () => {
  it("keeps stderr and unreadable stdout lines as the log, 20 lines of 500 characters", async () => {
    const { supervisor, spawner, mirrored } = await runningBridge();
    const child = spawner.children[0];
    child?.writeStdout("not json at all\n");
    for (let index = 0; index < 25; index += 1) {
      child?.writeStderr(`log ${index}\n`);
    }
    child?.writeStderr(`${"w".repeat(800)}\n`);
    await tick();
    const { log } = supervisor.status("axis");
    expect(log).toHaveLength(20);
    expect(log.at(-1)).toHaveLength(500);
    expect(log.at(-2)).toBe("log 24");
    expect(mirrored[0]).toBe("not json at all");
    expect(mirrored.at(-1)).toHaveLength(500);
  });

  it("reassembles a line split between two chunks", async () => {
    const { supervisor, spawner } = started();
    await supervisor.start("axis", LOCAL);
    spawner.children[0]?.writeStdout(READY.slice(0, 20));
    await tick();
    expect(supervisor.status("axis").state).toBe("starting");
    spawner.children[0]?.writeStdout(`${READY.slice(20)}\n`);
    await tick();
    expect(supervisor.status("axis").state).toBe("running");
  });
});

describe("closing and lingering children", () => {
  it("refuses a start once close began", async () => {
    const { supervisor, spawner } = started();
    await supervisor.close();
    await expect(supervisor.start("axis", LOCAL)).rejects.toThrow("shutting down");
    expect(spawner.calls).toHaveLength(0);
  });

  it("still counts a child that outlives its start timeout", async () => {
    const { supervisor, spawner } = started({
      exitsOnSigterm: false,
      timeoutMs: 30,
      killGraceMs: 2000,
    });
    await supervisor.start("axis", LOCAL);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(supervisor.status("axis").state).toBe("failed");
    await expect(supervisor.start("axis", LOCAL)).rejects.toMatchObject({ code: "conflict" });
    await expect(supervisor.start("second", LOCAL)).resolves.toBeDefined();
    expect(spawner.calls).toHaveLength(2);
  });
});

describe("the external bridge", () => {
  it("shows a bridge on the bus that Pantin did not start, and refuses to start over it", async () => {
    const { supervisor, busFacts } = started();
    busFacts.bridgeConnected = true;
    expect(supervisor.status("axis").externalBridgeConnected).toBe(true);
    await expect(supervisor.start("axis", LOCAL)).rejects.toThrow("outside Pantin");
  });

  it("is not external once Pantin's own bridge connected", async () => {
    const { supervisor, busFacts } = started();
    await supervisor.start("axis", LOCAL);
    busFacts.bridgeConnected = true;
    expect(supervisor.status("axis").externalBridgeConnected).toBe(false);
  });
});

describe("the bridge log file", () => {
  const LOG = "/logs/axis/bridge.log";

  it("records the core events and every bridge line, in order", async () => {
    const { supervisor, spawner, logFiles } = await runningBridge();
    spawner.children[0]?.writeStderr("2026-10-17 10:00:01,000 INFO hello\n");
    await tick();
    supervisor.stop("axis");
    spawner.children[0]?.end(0, null);
    await tick();

    expect(logFiles.files.get(LOG)?.split("\n")).toEqual([
      "2026-10-17T10:00:00.000Z CORE INFO Start requested: listen 127.0.0.1, allow none.",
      "2026-10-17T10:00:00.000Z CORE INFO Bridge ready: modules m1:1502.",
      "2026-10-17T10:00:00.000Z BRIDGE 2026-10-17 10:00:01,000 INFO hello",
      "2026-10-17T10:00:00.000Z CORE INFO Stop requested.",
      "2026-10-17T10:00:00.000Z CORE INFO Bridge stopped.",
      "",
    ]);
    expect(await supervisor.readLog("axis")).toBe(logFiles.files.get(LOG));
  });

  it("records a failure with its kind, and a spawn failure", async () => {
    const { supervisor, spawner, logFiles } = await runningBridge();
    spawner.children[0]?.end(null, "SIGKILL");
    await supervisor.close();
    expect(logFiles.files.get(LOG)).toContain("CORE ERROR Bridge failed (crashed):");
  });

  it("sends only WARNING and ERROR bridge lines to the console, without timestamp or level", async () => {
    const { supervisor, spawner, consoleMessages } = await runningBridge();
    spawner.children[0]?.writeStderr("2026-10-17 10:00:01,000 INFO quiet\n");
    spawner.children[0]?.writeStderr("2026-10-17 10:00:02,000 WARNING m: refused a request\n");
    spawner.children[0]?.writeStderr("2026-10-17 10:00:03,000 ERROR m: broke\n");
    spawner.children[0]?.writeStderr("Traceback (most recent call last):\n");
    await tick();
    expect(consoleMessages).toEqual(["m: refused a request", "m: broke"]);
    await supervisor.close();
  });

  it("reads an empty log for a Pantin that never ran a bridge", async () => {
    const { supervisor } = await runningBridge();
    expect(await supervisor.readLog("never")).toBe("");
  });
});
