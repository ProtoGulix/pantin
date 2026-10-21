import { describe, expect, it } from "vitest";
import {
  type Bench,
  LOCAL,
  OPCUA,
  OPCUA_ENTRY,
  OPCUA_READY,
  OPCUA_START,
  tick,
  useBridgeBenches,
} from "../test-support/bridge-bench.ts";

// Starting the OPC UA client bridge: its command line, environment and stdin, and where
// its passwords may and may not be (ADR 0065 points 5 and 9).

const { started } = useBridgeBenches();
const MARKER = "marker-password-9d3e";
const WITH_PASSWORD = { ...OPCUA_START, passwords: { plc: MARKER } };
const WITHOUT_PASSWORD = { ...OPCUA_START, passwords: {} };
const AUTH_FAILED =
  '{"event":"exiting","kind":"authentication_failed","message":"The PLC refused the login of module plc.","certificate":null,"module":"plc"}\n';

function everythingTheCoreShows(bench: Bench): string {
  return JSON.stringify([
    bench.supervisor.statuses("axis"),
    bench.changes,
    bench.mirrored,
    bench.consoleMessages,
    bench.failures,
    [...bench.logFiles.files.values()],
    bench.spawner.calls.map(({ command, args, options }) => [command, args, options]),
  ]);
}

describe("the child of the OPC UA bridge", () => {
  it("runs the entry file with the common, host and kind arguments, in that order", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    expect(spawner.calls[0]).toMatchObject({
      command: "/node",
      args: [
        OPCUA_ENTRY,
        "--status-lines",
        "--core",
        "http://127.0.0.1:4800",
        "--pantin",
        "axis",
        "--pki-dir",
        "/pki",
        "--target",
        "plc=127.0.0.1",
      ],
      options: { stdio: ["pipe", "pipe", "pipe"], shell: false, env: { PATH: "/bin" } },
    });
  });

  it("passes the trusted certificates after the targets", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", { ...OPCUA_START, trust: ["B".repeat(64)] });
    expect(spawner.calls[0]?.args.slice(-2)).toEqual(["--trust", "b".repeat(64)]);
  });

  it("writes one line of passwords to stdin, then closes it", async () => {
    const { supervisor, spawner } = started({ withOpcua: true, opcuaWithUser: true });
    await supervisor.start("axis", WITH_PASSWORD);
    await tick();
    const child = spawner.children[0];
    expect(child?.stdinText()).toBe(`{"passwords":{"plc":"${MARKER}"}}\n`);
    expect(child?.isStdinClosed()).toBe(true);
  });

  it("still writes the line, empty, when no module logs in", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    await tick();
    expect(spawner.children[0]?.stdinText()).toBe('{"passwords":{}}\n');
    expect(spawner.children[0]?.isStdinClosed()).toBe(true);
  });

  it("leaves the Modbus child as it was: no stdin, the inherited environment", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", LOCAL);
    expect(spawner.calls[0]?.options).toEqual({ stdio: ["ignore", "pipe", "pipe"], shell: false });
    expect(spawner.children[0]?.stdinText()).toBe("");
  });
});

describe("the passwords the core holds", () => {
  it("shows a marker password nowhere: not in a status, a log, the console or a command line", async () => {
    const bench = started({ withOpcua: true, opcuaWithUser: true });
    await bench.supervisor.start("axis", WITH_PASSWORD);
    bench.spawner.children[0]?.writeStdout(`${OPCUA_READY}\n`);
    bench.spawner.children[0]?.writeStderr(
      "2026-10-17 10:00:01,000 WARNING module plc: retrying\n",
    );
    await tick();
    bench.spawner.children[0]?.end(1, null);
    await tick();

    const shown = everythingTheCoreShows(bench);
    expect(shown).toContain("plc=127.0.0.1");
    expect(shown).not.toContain(MARKER);
    expect(bench.supervisor.status("axis", OPCUA).network).toEqual({
      targets: { plc: "127.0.0.1" },
    });
  });

  it("keeps the password for the next start, which may omit it", async () => {
    const { supervisor, spawner } = started({ withOpcua: true, opcuaWithUser: true });
    await supervisor.start("axis", WITH_PASSWORD);
    supervisor.stop("axis", OPCUA);
    spawner.children[0]?.end(0, null);
    await tick();

    await supervisor.start("axis", WITHOUT_PASSWORD);
    expect(spawner.children[1]?.stdinText()).toBe(`{"passwords":{"plc":"${MARKER}"}}\n`);
  });

  it("refuses a user module with no password stored and none given, spawning nothing", async () => {
    const { supervisor, spawner } = started({ withOpcua: true, opcuaWithUser: true });
    await expect(supervisor.start("axis", WITHOUT_PASSWORD)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(spawner.calls).toHaveLength(0);
  });

  it("keeps nothing of a refused start", async () => {
    const { supervisor, passwordStore } = started({ withOpcua: true, opcuaWithUser: true });
    await expect(
      supervisor.start("axis", { ...WITH_PASSWORD, targets: { plc: "8.8.8.8" } }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(passwordStore.of("axis")).toEqual({});
  });

  it("forgets the password of a module whose login was refused, and only then", async () => {
    const { supervisor, spawner, passwordStore } = started({
      withOpcua: true,
      opcuaWithUser: true,
    });
    await supervisor.start("axis", WITH_PASSWORD);
    spawner.children[0]?.end(1, null);
    await tick();
    expect(passwordStore.of("axis")).toEqual({ plc: MARKER });

    await supervisor.start("axis", WITHOUT_PASSWORD);
    spawner.children[1]?.writeStdout(AUTH_FAILED);
    spawner.children[1]?.end(1, null);
    await tick();
    expect(passwordStore.of("axis")).toEqual({});
    await expect(supervisor.start("axis", WITHOUT_PASSWORD)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("keeps the passwords of one Pantin apart from another's", async () => {
    const { supervisor, passwordStore } = started({ withOpcua: true, opcuaWithUser: true });
    await supervisor.start("axis", WITH_PASSWORD);
    expect(passwordStore.of("second")).toEqual({});
    await expect(supervisor.start("second", WITHOUT_PASSWORD)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("keeps a password only while the module's target is the one it was given for", async () => {
    const { supervisor, spawner, passwordStore } = started({
      withOpcua: true,
      opcuaWithUser: true,
    });
    await supervisor.start("axis", WITH_PASSWORD);
    supervisor.stop("axis", OPCUA);
    spawner.children[0]?.end(0, null);
    await tick();

    await expect(
      supervisor.start("axis", { ...WITHOUT_PASSWORD, targets: { plc: "::1" } }),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: expect.stringContaining("password"),
    });
    expect(passwordStore.of("axis")).toEqual({});
    expect(spawner.calls).toHaveLength(1);

    await expect(supervisor.start("axis", WITHOUT_PASSWORD)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(spawner.children.map((child) => child.stdinText()).join("")).not.toContain("::1");
  });

  it("never hands the old password to the new target, and takes a new one for it", async () => {
    const { supervisor, spawner } = started({ withOpcua: true, opcuaWithUser: true });
    await supervisor.start("axis", WITH_PASSWORD);
    supervisor.stop("axis", OPCUA);
    spawner.children[0]?.end(0, null);
    await tick();

    await supervisor.start("axis", {
      ...OPCUA_START,
      targets: { plc: "::1" },
      passwords: { plc: "new-password" },
    });
    await tick();
    expect(spawner.children[1]?.stdinText()).toBe('{"passwords":{"plc":"new-password"}}\n');
    expect(spawner.children[1]?.stdinText()).not.toContain(MARKER);
  });

  it("clears them when the core stops", async () => {
    const { supervisor, passwordStore } = started({ withOpcua: true, opcuaWithUser: true });
    await supervisor.start("axis", WITH_PASSWORD);
    expect(passwordStore.of("axis")).toEqual({ plc: MARKER });
    await supervisor.close();
    expect(passwordStore.of("axis")).toEqual({});
  });
});

describe("the client certificate of the OPC UA status", () => {
  const CERTIFICATE = {
    subject: "CN=Pantin",
    applicationUri: "urn:pantin:test:opcua-bridge",
    sha256: "c".repeat(64),
    sha1: "d".repeat(40),
  };

  it("is null until the bridge is ready, then shown, and kept after a stop and a failure", async () => {
    const { supervisor, spawner } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    expect(supervisor.status("axis", OPCUA)).toMatchObject({ clientCertificate: null });

    spawner.children[0]?.writeStdout(`${OPCUA_READY}\n`);
    await tick();
    expect(supervisor.status("axis", OPCUA)).toMatchObject({
      state: "running",
      clientCertificate: CERTIFICATE,
    });

    supervisor.stop("axis", OPCUA);
    spawner.children[0]?.end(0, null);
    await tick();
    expect(supervisor.status("axis", OPCUA)).toMatchObject({
      state: "stopped",
      clientCertificate: CERTIFICATE,
    });

    await supervisor.start("axis", OPCUA_START);
    spawner.children[1]?.end(1, null);
    await tick();
    expect(supervisor.status("axis", OPCUA)).toMatchObject({
      state: "failed",
      clientCertificate: CERTIFICATE,
    });
  });
});

describe("the console warning opcua_unsecured_lan", () => {
  it("is requested for a private-network target with security None, not for this machine", async () => {
    const { supervisor, unsecuredLanWarnings } = started({ withOpcua: true });
    await supervisor.start("axis", OPCUA_START);
    expect(unsecuredLanWarnings).toEqual([]);
    supervisor.stop("axis", OPCUA);
    await supervisor.close();

    const lan = started({ withOpcua: true });
    await lan.supervisor.start("axis", { ...OPCUA_START, targets: { plc: "192.168.1.10" } });
    expect(lan.unsecuredLanWarnings).toEqual([["plc"]]);
  });
});
