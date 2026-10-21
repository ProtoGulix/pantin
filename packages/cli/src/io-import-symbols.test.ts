import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IoDocumentSchema } from "@pantin/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// `pantin io import-symbols` (ADR 0064 point 13), on a copy of the axis example with a valve:
// after `io init` its variables are axis_stroke_setpoint, axis_stroke_position,
// axis_valve_coil_14 and axis_valve_coil_12.

const NAMESPACE = "http://www.3s-software.com/schemas/Symbolconfiguration.xsd";

const SYMBOLS = `<?xml version="1.0" encoding="utf-8"?>
<Symbolconfiguration xmlns="${NAMESPACE}">
  <Header><ProjectInfo name="Demo" devicename="Device" appname="Application" /></Header>
  <TypeList>
    <TypeSimple name="T_BOOL" iecname="BOOL" />
    <TypeSimple name="T_LREAL" iecname="LREAL" />
    <TypeSimple name="T_STRING" iecname="STRING" />
  </TypeList>
  <NodeList>
    <Node name="Application">
      <Node name="GVL">
        <Node name="axis_valve_coil_14" type="T_BOOL" access="ReadWrite" />
        <Node name="axis_stroke_setpoint" type="T_STRING" access="ReadWrite" />
      </Node>
      <Node name="PLC_PRG">
        <Node name="AxisValveCoil12" type="T_BOOL" access="ReadWrite" />
        <Node name="axisStrokePosition" type="T_LREAL" access="ReadWrite" />
      </Node>
    </Node>
  </NodeList>
</Symbolconfiguration>
`;

let folder: string;
let symbolFile: string;

beforeEach(async () => {
  const workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
  symbolFile = join(workspace, "symbols.xml");
  await writeFile(symbolFile, SYMBOLS);
  expect((await runCli(["io", "init", folder])).code).toBe(0);
});

const ioJson = () => readFile(join(folder, "io.json"), "utf8");

async function variables(): Promise<Record<string, string>> {
  const document = IoDocumentSchema.parse(JSON.parse(await ioJson()));
  const channels = document.modules.flatMap((module) => module.channels);
  return Object.fromEntries(channels.map((channel) => [channel.tag, channel.variable]));
}

describe("without --apply", () => {
  it("prints the preview in sections with counts and writes nothing", async () => {
    const before = await ioJson();
    const { code, stdout, stderr } = await runCli(["io", "import-symbols", folder, symbolFile]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Format codesys-symbolconfiguration");
    expect(stdout).toContain("4 symbols read");
    expect(stdout).toContain("Matched: 1");
    expect(stdout).toContain("axis.valve.coil_12: axis_valve_coil_12 -> PLC_PRG.AxisValveCoil12");
    expect(stdout).toContain("To check (warnings): 1");
    expect(stdout).toContain(
      "axis.stroke.position: axis_stroke_position -> PLC_PRG.axisStrokePosition",
    );
    expect(stdout).toContain("Unchanged: 2");
    expect(stdout).toContain("(exact, incompatible)");
    expect(stdout).toContain("Unmatched signals: 0");
    expect(await ioJson()).toBe(before);
  });

  it("takes the format from --format", async () => {
    const named = await runCli([
      "io",
      "import-symbols",
      folder,
      symbolFile,
      "--format",
      "codesys-symbolconfiguration",
    ]);
    expect(named.code).toBe(0);
    const unknown = await runCli(["io", "import-symbols", folder, symbolFile, "--format", "tia"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("codesys-symbolconfiguration");
  });
});

describe("with --apply", () => {
  it("writes the compatible proposals only and says what was left", async () => {
    const { code, stdout } = await runCli(["io", "import-symbols", folder, symbolFile, "--apply"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Applied 1 variable(s)");
    expect(stdout).toContain("--accept-warnings");
    expect(await variables()).toMatchObject({
      "axis.valve.coil_12": "PLC_PRG.AxisValveCoil12",
      "axis.valve.coil_14": "axis_valve_coil_14",
      "axis.stroke.position": "axis_stroke_position",
      "axis.stroke.setpoint": "axis_stroke_setpoint",
    });
  });

  it("writes the proposals to check too with --accept-warnings, never an incompatible one", async () => {
    const { code } = await runCli([
      "io",
      "import-symbols",
      folder,
      symbolFile,
      "--apply",
      "--accept-warnings",
    ]);
    expect(code).toBe(0);
    expect(await variables()).toMatchObject({
      "axis.valve.coil_12": "PLC_PRG.AxisValveCoil12",
      "axis.stroke.position": "PLC_PRG.axisStrokePosition",
      "axis.stroke.setpoint": "axis_stroke_setpoint",
    });
  });

  it("applies the same twice without a change the second time", async () => {
    await runCli(["io", "import-symbols", folder, symbolFile, "--apply"]);
    const once = await ioJson();
    const again = await runCli(["io", "import-symbols", folder, symbolFile, "--apply"]);
    expect(again.stdout).toContain("Applied 0 variable(s)");
    expect(await ioJson()).toBe(once);
  });

  it("writes a version 2 file from a version 1 one", async () => {
    const document = IoDocumentSchema.parse(JSON.parse(await ioJson()));
    const [module] = document.modules;
    const version1 = {
      schema_version: 1,
      modules: [
        {
          key: module?.key,
          ...module?.transport,
          kind: undefined,
          channels: module?.channels.map(({ modbus, ...channel }) => ({ ...channel, ...modbus })),
        },
      ],
    };
    await writeFile(join(folder, "io.json"), JSON.stringify(version1, null, 2));
    const { code } = await runCli(["io", "import-symbols", folder, symbolFile, "--apply"]);
    expect(code).toBe(0);
    expect(JSON.parse(await ioJson())).toMatchObject({ schema_version: 2 });
    expect((await variables())["axis.valve.coil_12"]).toBe("PLC_PRG.AxisValveCoil12");
  });
});

describe("what it refuses", () => {
  it("prints the usage for missing arguments and refuses --accept-warnings without --apply", async () => {
    expect((await runCli(["io", "import-symbols", folder])).code).toBe(2);
    expect((await runCli(["io", "import-symbols", folder, symbolFile, "--bogus"])).code).toBe(2);
    const alone = await runCli(["io", "import-symbols", folder, symbolFile, "--accept-warnings"]);
    expect(alone.code).toBe(2);
    expect(alone.stderr).toContain("--apply");
  });

  it("names a symbol file that is missing, not UTF-8, or of no known format", async () => {
    const missing = await runCli(["io", "import-symbols", folder, join(folder, "nope.xml")]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("does not exist");
    const latin1 = join(folder, "latin1.xml");
    await writeFile(latin1, Uint8Array.of(0x3c, 0xe9, 0x3e));
    expect((await runCli(["io", "import-symbols", folder, latin1])).stderr).toContain("UTF-8");
    const other = join(folder, "other.xml");
    await writeFile(other, "<other/>");
    expect((await runCli(["io", "import-symbols", folder, other])).stderr).toContain(
      "codesys-symbolconfiguration",
    );
  });

  it("asks for io init when the folder has no io.json", async () => {
    const bare = await copyAxisWithValve(await tmpWorkspace());
    const { code, stderr } = await runCli(["io", "import-symbols", bare, symbolFile]);
    expect(code).toBe(1);
    expect(stderr).toContain("pantin io init");
  });
});
