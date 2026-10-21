import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// pantin gvl, and the commands that read both versions of io.json (ADR 0049
// point 9, ADR 0064 points 7 and 9).

let workspace: string;
let folder: string;

beforeEach(async () => {
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

const ioPath = () => join(folder, "io.json");
const ioText = () => readFile(ioPath(), "utf8");
const ioJson = async () => JSON.parse(await ioText());

describe("pantin gvl", () => {
  it("refuses an invalid mapping with its problems, and prints no GVL", async () => {
    await runCli(["io", "init", folder]);
    await writeFile(ioPath(), (await ioText()).replace("axis.valve.coil_12", "axis.valve.ghost"));
    const result = await runCli(["gvl", folder]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("The mapping is invalid");
    expect(result.stderr).toMatch(
      /io\.json: modules\[0\]\.channels\[1\]\.tag: Tag "axis\.valve\.ghost"/,
    );
  });

  it("notes unmapped tags on stderr and still prints the GVL", async () => {
    await runCli(["io", "init", folder]);
    const document = await ioJson();
    document.modules[0].channels.splice(2);
    await writeFile(ioPath(), JSON.stringify(document));
    const result = await runCli(["gvl", folder]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("note: 2 tag(s) are not mapped and not in the GVL.\n");
  });

  it("asks for io init when there is no io.json, and refuses a bad usage", async () => {
    const result = await runCli(["gvl", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("pantin io init")]);
    expect((await runCli(["gvl"])).code).toBe(2);
  });
});

describe("pantin gvl, dotted variables", () => {
  it("leaves a dotted variable out of the declarations and lists it in the header", async () => {
    await runCli(["io", "init", folder]);
    const document = await ioJson();
    document.modules[0].channels[0].variable = "GVL_IO.Valve.Extend";
    await writeFile(ioPath(), JSON.stringify(document, null, 2));
    const result = await runCli(["gvl", folder]);
    expect(result.code).toBe(0);
    const [header = "", declarations = ""] = result.stdout.split("VAR_GLOBAL\n");
    expect(header).toContain("GVL_IO.Valve.Extend");
    expect(declarations).not.toContain("GVL_IO");
    expect(declarations).toContain("axis_valve_coil_12 : BOOL;");
  });
});

describe("the commands read a version 1 io.json", () => {
  async function writeVersion1(): Promise<void> {
    const document = {
      schema_version: 1,
      modules: [
        {
          key: "m1",
          port: 1700,
          channels: [
            {
              tag: "axis.valve.coil_14",
              variable: "my_valve",
              zone: "coil",
              address: 0,
              ioType: "BOOL",
              comment: "",
            },
          ],
        },
      ],
    };
    await writeFile(ioPath(), JSON.stringify(document));
  }

  it("prints the GVL and the CSV without rewriting the file", async () => {
    await writeVersion1();
    const before = await ioText();
    const gvl = await runCli(["gvl", folder]);
    const csv = await runCli(["io", "export", folder]);
    expect(gvl.stdout).toContain("my_valve : BOOL; // m1 coil 0, axis.valve.coil_14");
    expect(csv.stdout).toContain('m1,Modbus TCP slave,"port 1700, unit 1",axis.valve.coil_14');
    expect(await ioText()).toBe(before);
  });

  it("validates it, and says nothing about the version", async () => {
    await writeVersion1();
    const result = await runCli(["validate", folder]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });
});
