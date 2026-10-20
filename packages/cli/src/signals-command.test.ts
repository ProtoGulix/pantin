import { rm } from "node:fs/promises";
import { join } from "node:path";
import { SignalListResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// pantin signals (ADR 0064 point 2).

let workspace: string;
let folder: string;

beforeEach(async () => {
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

describe("pantin signals", () => {
  it("prints a table with one row per signal, in tag order", async () => {
    const result = await runCli(["signals", folder]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^NAME\s+TYPE\s+DIRECTION\s+UNIT\s+OWNER$/);
    expect(lines.slice(1).map((line) => line.split(/\s+/).slice(0, 4))).toEqual([
      ["axis.stroke.setpoint", "float", "command", "metre"],
      ["axis.stroke.position", "float", "feedback", "metre"],
      ["axis.valve.coil_14", "bit", "command", "none"],
      ["axis.valve.coil_12", "bit", "command", "none"],
    ]);
  });

  it("prints the same list as JSON with --json, whatever the argument order", async () => {
    const result = await runCli(["signals", "--json", folder]);
    expect(result.code).toBe(0);
    const { signals } = SignalListResponseSchema.parse(JSON.parse(result.stdout));
    expect(signals.map((signal) => signal.name)).toEqual([
      "axis.stroke.setpoint",
      "axis.stroke.position",
      "axis.valve.coil_14",
      "axis.valve.coil_12",
    ]);
    expect(signals[0]?.owner).toEqual({ kind: "joint", id: "stroke", name: "Stroke" });
  });

  it("refuses a folder without pantin.json, naming the file", async () => {
    const result = await runCli(["signals", join(workspace, "nothing")]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^error: .*pantin\.json/);
  });

  it("answers the usage and code 2 without a folder", async () => {
    const result = await runCli(["signals", "--json"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("signals <folder> [--json]");
  });
});
