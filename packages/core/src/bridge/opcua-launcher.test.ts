import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allowlistedEnvironment,
  defaultPkiDirectory,
  opcuaLauncherOf,
  realPathOfFutureFolder,
  resolveOpcuaLauncher,
} from "./opcua-launcher.ts";

describe("allowlistedEnvironment", () => {
  it("keeps the allowed names and nothing else", () => {
    const source = {
      PATH: "/usr/bin",
      HOME: "/home/a",
      USERPROFILE: "C:\\Users\\a",
      LANG: "fr_FR.UTF-8",
      LC_ALL: "C",
      TZ: "UTC",
      TMPDIR: "/tmp",
      TEMP: "C:\\Temp",
      TMP: "C:\\Tmp",
      SystemRoot: "C:\\Windows",
      XDG_STATE_HOME: "/state",
      NODE_OPTIONS: "--require /evil.js",
      NODE_PATH: "/evil",
      NODEOPCUA_LOG: "1",
      HTTPS_PROXY: "http://proxy",
      PANTIN_SECRET: "x",
    };
    expect(allowlistedEnvironment(source)).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/a",
      USERPROFILE: "C:\\Users\\a",
      LANG: "fr_FR.UTF-8",
      LC_ALL: "C",
      TZ: "UTC",
      TMPDIR: "/tmp",
      TEMP: "C:\\Temp",
      TMP: "C:\\Tmp",
      SystemRoot: "C:\\Windows",
      XDG_STATE_HOME: "/state",
    });
  });

  it("leaves out a name that is not set", () => {
    expect(allowlistedEnvironment({ PATH: "/bin", LANG: undefined })).toEqual({ PATH: "/bin" });
  });
});

describe("defaultPkiDirectory", () => {
  it("lives under XDG_STATE_HOME when it is absolute", () => {
    expect(defaultPkiDirectory({ XDG_STATE_HOME: "/var/state" }, "/home/a")).toBe(
      "/var/state/pantin/opcua-pki",
    );
  });

  it("falls back to ~/.local/state, also for a relative XDG_STATE_HOME", () => {
    expect(defaultPkiDirectory({}, "/home/a")).toBe("/home/a/.local/state/pantin/opcua-pki");
    expect(defaultPkiDirectory({ XDG_STATE_HOME: "state" }, "/home/a")).toBe(
      "/home/a/.local/state/pantin/opcua-pki",
    );
  });
});

describe("opcuaLauncherOf", () => {
  it("runs node on the entry file, with the PKI folder as a host argument", () => {
    expect(
      opcuaLauncherOf({
        nodePath: "/usr/bin/node",
        entryPath: "/repo/main.ts",
        pkiDirectory: "/pki",
        environment: { PATH: "/bin" },
      }),
    ).toEqual({
      kind: "opcua_client",
      command: "/usr/bin/node",
      args: ["/repo/main.ts"],
      hostArguments: ["--pki-dir", "/pki"],
      environment: { PATH: "/bin" },
    });
  });
});

describe("at start-up", () => {
  let root: string;
  let pantinsDirectory: string;
  let entry: string;

  beforeEach(async () => {
    // Real path: /tmp may itself be a link (macOS), and the check compares real paths.
    root = await realpath(await mkdtemp(join(tmpdir(), "pantin-launcher-")));
    pantinsDirectory = join(root, "pantins");
    entry = join(root, "bridge-main.ts");
    await mkdir(pantinsDirectory);
    await writeFile(entry, "");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function resolveWith(options: { entryOption?: string; pkiOption?: string }) {
    return resolveOpcuaLauncher({
      entryOption: options.entryOption,
      pkiOption: options.pkiOption,
      pantinsDirectory,
      nodePath: "/usr/bin/node",
      environment: { PATH: "/bin", NODE_OPTIONS: "--inspect" },
      homeDirectory: join(root, "home"),
    });
  }

  it("gives no launcher without --opcua-bridge, whatever the PKI option says", async () => {
    expect(await resolveWith({ pkiOption: join(pantinsDirectory, "pki") })).toEqual({
      ok: true,
      launcher: undefined,
    });
  });

  it("refuses an entry file that does not exist", async () => {
    const result = await resolveWith({ entryOption: join(root, "missing.ts") });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("--opcua-bridge");
  });

  it("builds the launcher with the default PKI folder and the filtered environment", async () => {
    const result = await resolveWith({ entryOption: entry });
    expect(result).toEqual({
      ok: true,
      launcher: {
        kind: "opcua_client",
        command: "/usr/bin/node",
        args: [entry],
        hostArguments: ["--pki-dir", join(root, "home", ".local", "state", "pantin", "opcua-pki")],
        environment: { PATH: "/bin" },
      },
    });
  });

  it("refuses a PKI folder inside the Pantins folder, also one that does not exist yet", async () => {
    for (const pkiOption of [pantinsDirectory, join(pantinsDirectory, "deep", "pki")]) {
      const result = await resolveWith({ entryOption: entry, pkiOption });
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).toContain("inside the Pantins folder");
    }
  });

  it("refuses a PKI folder that reaches the Pantins folder through a symbolic link", async () => {
    const link = join(root, "link");
    await symlink(pantinsDirectory, link);
    const result = await resolveWith({ entryOption: entry, pkiOption: join(link, "pki") });
    expect(result).toMatchObject({ ok: false });
  });

  it("accepts a PKI folder next to the Pantins folder, with a name that merely starts like it", async () => {
    const pkiOption = join(root, "pantins-pki");
    const result = await resolveWith({ entryOption: entry, pkiOption });
    expect(result).toMatchObject({
      ok: true,
      launcher: { hostArguments: ["--pki-dir", pkiOption] },
    });
  });

  it("finds the real path of a folder through its nearest existing ancestor", async () => {
    expect(await realPathOfFutureFolder(join(root, "a", "b", "c"))).toBe(join(root, "a", "b", "c"));
  });
});
