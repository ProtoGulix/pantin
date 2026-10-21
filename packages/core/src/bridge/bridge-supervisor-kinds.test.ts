import { describe, expect, it } from "vitest";
import {
  LOCAL,
  MODBUS,
  OPCUA,
  OPCUA_ENTRY,
  OPCUA_READY,
  OPCUA_START,
  READY,
  tick,
  useBridgeBenches,
} from "../test-support/bridge-bench.ts";

// One bridge per (Pantin, kind), each with its own state machine (ADR 0065 point 5).

const { started } = useBridgeBenches();

describe("one entry per Pantin and kind", () => {
  it("lists a status per kind, in the registry order, whatever was started", async () => {
    const { supervisor } = started({ withOpcua: true });
    expect(supervisor.statuses("axis").map((status) => status.transport)).toEqual([MODBUS, OPCUA]);
    await supervisor.start("axis", LOCAL);
    expect(supervisor.statuses("axis").map((status) => status.state)).toEqual([
      "starting",
      "stopped",
    ]);
  });

  it("runs both kinds for one Pantin, each with its own command and modules", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    spawner.children[0]?.writeStdout(`${READY}\n`);
    spawner.children[1]?.writeStdout(`${OPCUA_READY}\n`);
    await tick();

    expect(spawner.calls.map(({ command }) => command)).toEqual(["/venv/bin/python", "/node"]);
    expect(spawner.calls[1]?.args.slice(0, 1)).toEqual([OPCUA_ENTRY]);
    expect(supervisor.status("axis", MODBUS).modules.map(({ endpoint }) => endpoint)).toEqual([
      "127.0.0.1:1502",
    ]);
    expect(supervisor.status("axis", OPCUA).modules.map(({ endpoint }) => endpoint)).toEqual([
      "opc.tcp://127.0.0.1:4840",
    ]);
  });
});

describe("the states of the two kinds are apart", () => {
  it("stops one kind and leaves the other running", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    spawner.children[0]?.writeStdout(`${READY}\n`);
    spawner.children[1]?.writeStdout(`${OPCUA_READY}\n`);
    await tick();

    supervisor.stop("axis", OPCUA);
    spawner.children[1]?.end(0, null);
    await tick();

    expect(supervisor.status("axis", OPCUA).state).toBe("stopped");
    expect(supervisor.status("axis", MODBUS).state).toBe("running");
    expect(spawner.children[0]?.signals).toEqual([]);
  });

  it("fails one kind without touching the other", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    spawner.children[1]?.end(1, null);
    await tick();
    expect(supervisor.status("axis", OPCUA).failure?.kind).toBe("crashed");
    expect(supervisor.status("axis", MODBUS)).toMatchObject({ state: "starting", failure: null });
  });

  it("refuses a second start of the same kind, not of the other", async () => {
    const { supervisor } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    await expect(supervisor.start("axis", OPCUA_START)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(supervisor.start("axis", LOCAL)).resolves.toBeDefined();
  });

  it("answers bridge_unavailable for a kind without a launcher, and says so in its status", async () => {
    const { supervisor } = started();
    expect(supervisor.status("axis", OPCUA).availability).toBe("unavailable");
    expect(supervisor.status("axis", MODBUS).availability).toBe("available");
    await expect(supervisor.start("axis", OPCUA_START)).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });

  it("publishes one change for the Pantin whichever kind changed", async () => {
    const { supervisor, changes } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    expect(changes).toEqual(["axis"]);
  });
});

describe("the cap of 4 bridges counts every kind", () => {
  it("refuses a fifth bridge when two Pantins run both kinds", async () => {
    const { supervisor } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    await supervisor.start("second", LOCAL);
    await supervisor.start("second", OPCUA_START);
    await expect(supervisor.start("third", OPCUA_START)).rejects.toThrow("4 bridges");
  });
});

describe("port claims", () => {
  it("are made by a kind that listens only: an OPC UA bridge holds none", async () => {
    const { supervisor } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    // The Modbus module of another Pantin sits on 1503, the OPC UA module on 4840: neither
    // is a Modbus port held by the running OPC UA bridge.
    await expect(supervisor.start("second", LOCAL)).resolves.toBeDefined();
  });

  it("are still enforced between two Modbus bridges", async () => {
    const { supervisor } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await expect(supervisor.start("other", LOCAL)).rejects.toThrow("Pantin axis");
  });
});

describe("the external bridge, per kind", () => {
  it("shows a Modbus bridge that Pantin did not start, and lets the OPC UA one start", async () => {
    const { supervisor, busFacts } = started({ withOpcua: true });
    busFacts[MODBUS].bridgeConnected = true;
    expect(supervisor.status("axis", MODBUS).externalBridgeConnected).toBe(true);
    expect(supervisor.status("axis", OPCUA).externalBridgeConnected).toBe(false);
    await expect(supervisor.start("axis", LOCAL)).rejects.toThrow("outside Pantin");
    await expect(supervisor.start("axis", OPCUA_START)).resolves.toBeDefined();
  });

  it("is not external once Pantin's own bridge of that kind connected", async () => {
    const { supervisor, busFacts } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    busFacts[OPCUA].bridgeConnected = true;
    expect(supervisor.status("axis", OPCUA).externalBridgeConnected).toBe(false);
  });
});

describe("the PLC state of a module", () => {
  it("carries the reason the PLC side reported, and none once connected", async () => {
    const { supervisor, spawner, busFacts } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    spawner.children[0]?.writeStdout(`${OPCUA_READY}\n`);
    await tick();

    busFacts[OPCUA].plcModules.set("plc", { connected: false, reason: "certificate_rejected" });
    supervisor.refresh("axis");
    expect(supervisor.status("axis", OPCUA).modules).toEqual([
      {
        key: "plc",
        endpoint: "opc.tcp://127.0.0.1:4840",
        plcConnected: false,
        reason: "certificate_rejected",
      },
    ]);

    busFacts[OPCUA].plcModules.set("plc", { connected: true });
    expect(supervisor.status("axis", OPCUA).modules[0]).toMatchObject({
      plcConnected: true,
      reason: null,
    });
  });
});

describe("the bridge log, per kind", () => {
  it("writes each kind to its own file and reads it back by kind", async () => {
    const { supervisor, spawner, logFiles } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    spawner.children[1]?.writeStderr("2026-10-17 10:00:01,000 INFO opcua only\n");
    await tick();

    expect([...logFiles.files.keys()].sort()).toEqual([
      "/logs/axis/bridge-modbus_tcp_slave.log",
      "/logs/axis/bridge-opcua_client.log",
    ]);
    expect(await supervisor.readLog("axis", OPCUA)).toContain("opcua only");
    expect(await supervisor.readLog("axis", MODBUS)).not.toContain("opcua only");
  });

  it("sends a core line of the PLC link to its kind's file, or to every active kind when it has none", async () => {
    const { supervisor, logFiles } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    await supervisor.start("axis", OPCUA_START);
    supervisor.logCoreEvent("axis", OPCUA, "info", "PLC connected to module plc.");
    supervisor.logCoreEvent("axis", null, "error", "PLC write ignored on forced tag a.b.");
    await supervisor.close();

    const modbus = logFiles.files.get("/logs/axis/bridge-modbus_tcp_slave.log") ?? "";
    const opcua = logFiles.files.get("/logs/axis/bridge-opcua_client.log") ?? "";
    expect(opcua).toContain("PLC connected to module plc.");
    expect(modbus).not.toContain("PLC connected to module plc.");
    expect(opcua).toContain("forced tag a.b");
    expect(modbus).toContain("forced tag a.b");
  });
});
