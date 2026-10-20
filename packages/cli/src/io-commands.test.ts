import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IO_FILE_MAX_BYTES } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AXIS_TAGS, copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";
import { validatePantinFolder } from "./validate-folder.ts";

// pantin io init, pantin gvl and the io part of pantin validate (ADR 0049 point 9).

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

// The channels of axis in canonical order: zone, then address.
const CHANNELS = [
  ["axis.valve.coil_14", "coil", 0, "BOOL"],
  ["axis.valve.coil_12", "coil", 1, "BOOL"],
  ["axis.stroke.setpoint", "holding_register", 0, "REAL"],
  ["axis.stroke.position", "input_register", 0, "REAL"],
] as const;

describe("pantin io init", () => {
  it("writes the canonical io.json: module m1 on port 1502, every tag mapped", async () => {
    const result = await runCli(["io", "init", folder]);
    expect(result).toEqual({
      code: 0,
      stdout: 'Wrote io.json (4 channels in "m1").\n',
      stderr: "",
    });
    const text = await ioText();
    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      schema_version: 1,
      modules: [
        {
          key: "m1",
          port: 1502,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 1000,
          channels: CHANNELS.map(([tag, zone, address, ioType]) => ({
            tag,
            variable: tag.replaceAll(".", "_"),
            zone,
            address,
            ioType,
            comment: "",
          })),
        },
      ],
    });
  });

  it("writes a file that validates", async () => {
    await runCli(["io", "init", folder]);
    expect(await validatePantinFolder(folder)).toEqual({ problems: [], notes: [] });
  });
});

describe("pantin io init, refusals", () => {
  it("refuses an existing io.json and touches nothing", async () => {
    await writeFile(ioPath(), "keep me");
    const result = await runCli(["io", "init", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("already exists")]);
    expect(await ioText()).toBe("keep me");
  });

  it("refuses a folder that is not a valid Pantin", async () => {
    const result = await runCli(["io", "init", join(workspace, "nothing")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Is this a Pantin folder?");
  });

  it("takes --update before or after the folder, and refuses other arguments", async () => {
    expect((await runCli(["io", "init", "--update", folder])).code).toBe(0);
    expect((await runCli(["io", "init", folder, "--update"])).code).toBe(0);
    expect((await runCli(["io", "init"])).code).toBe(2);
    expect((await runCli(["io", "init", folder, "--force"])).code).toBe(2);
    expect((await runCli(["io", "init", folder, folder])).code).toBe(2);
  });
});

async function writeUserFile(): Promise<void> {
  const document = {
    schema_version: 1,
    modules: [
      {
        key: "m1",
        port: 1700,
        channels: [
          {
            tag: "axis.valve.coil_14",
            variable: "my_valve_extend",
            zone: "coil",
            address: 5,
            ioType: "BOOL",
            comment: "hand written",
          },
        ],
      },
    ],
  };
  await writeFile(ioPath(), JSON.stringify(document));
}

describe("pantin io init --update", () => {
  it("maps the unmapped tags only, keeps the user's channel and rewrites the canonical file", async () => {
    await writeUserFile();
    const result = await runCli(["io", "init", folder, "--update"]);
    expect(result).toEqual({
      code: 0,
      stdout: 'Mapped 3 tag(s) into "m1" in io.json.\n',
      stderr: "",
    });
    const written = await ioJson();
    expect(written.modules[0]).toMatchObject({ port: 1700, unitId: 1 });
    expect(
      written.modules[0].channels.map((c: { tag: string; address: number }) => [c.tag, c.address]),
    ).toEqual([
      ["axis.valve.coil_12", 0],
      ["axis.valve.coil_14", 5],
      ["axis.stroke.setpoint", 0],
      ["axis.stroke.position", 0],
    ]);
    expect(written.modules[0].channels[1].variable).toBe("my_valve_extend");
    expect((await ioText()).endsWith("}\n")).toBe(true);
  });
});

describe("pantin io init --update, nothing to add", () => {
  it("leaves the bytes alone when every tag is mapped and the file is canonical", async () => {
    await runCli(["io", "init", folder]);
    const before = await ioText();
    const result = await runCli(["io", "init", folder, "--update"]);
    expect(result.stdout).toBe("Nothing to add: every tag is mapped.\n");
    expect(await ioText()).toBe(before);
  });

  it("rewrites a mapped but not canonical file in canonical form", async () => {
    await runCli(["io", "init", folder]);
    await writeFile(ioPath(), JSON.stringify(await ioJson()));
    await runCli(["io", "init", folder, "--update"]);
    expect(await ioText()).toBe(`${JSON.stringify(await ioJson(), null, 2)}\n`);
  });
});

describe("pantin io init --update, edge cases", () => {
  it("is a plain init when there is no io.json", async () => {
    expect((await runCli(["io", "init", folder, "--update"])).code).toBe(0);
    expect((await ioJson()).modules[0].channels).toHaveLength(4);
  });

  it("refuses an unreadable io.json and one without module m1, changing nothing", async () => {
    await writeFile(ioPath(), "{nope");
    const broken = await runCli(["io", "init", folder, "--update"]);
    expect([broken.code, broken.stderr]).toEqual([1, expect.stringContaining("io.json: ")]);
    const text = JSON.stringify({
      schema_version: 1,
      modules: [{ key: "m2", port: 1600, channels: [] }],
    });
    await writeFile(ioPath(), text);
    const noM1 = await runCli(["io", "init", folder, "--update"]);
    expect([noM1.code, noM1.stderr]).toEqual([1, expect.stringContaining('no module "m1"')]);
    expect(await ioText()).toBe(text);
  });

  it("refuses an io.json over the size limit", async () => {
    await writeFile(ioPath(), " ".repeat(IO_FILE_MAX_BYTES + 1));
    const result = await runCli(["io", "init", folder, "--update"]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("larger than")]);
  });
});

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

describe("pantin validate and the mapping", () => {
  it("is silent about io when the folder has no io files", async () => {
    expect(await validatePantinFolder(folder)).toEqual({ problems: [], notes: [] });
  });

  it("prints a problem as `io.json: modules[0].channels[3].address: message` and fails", async () => {
    await runCli(["io", "init", folder]);
    const document = await ioJson();
    document.modules[0].channels[3].address = 70000;
    await writeFile(ioPath(), JSON.stringify(document, null, 2));
    const schemaInvalid = await runCli(["validate", folder]);
    expect(schemaInvalid.code).toBe(1);
    expect(schemaInvalid.stderr).toMatch(
      /^error: io\.json: modules\[0\]\.channels\[3\]\.address: /m,
    );
  });

  it("numbers channels in canonical order for rule problems, and says so when the file differs", async () => {
    await runCli(["io", "init", folder]);
    const document = await ioJson();
    // coil_12 now shares address 0 with coil_14. In the file, coil_14 is the
    // last channel (index 3); in canonical order (by tag) it is the second coil (index 1).
    document.modules[0].channels.reverse();
    document.modules[0].channels[2].address = 0;
    await writeFile(ioPath(), JSON.stringify(document, null, 2));
    const result = await runCli(["validate", folder]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(
      /error: io\.json: modules\[0\]\.channels\[1\]\.address: .*overlaps/,
    );
    expect(result.stdout).toContain("io.json is not in canonical form");
  });
});

describe("pantin validate and the mapping, notes", () => {
  it("adds no canonical form note when the file is the core's own text", async () => {
    await runCli(["io", "init", folder]);
    await writeFile(ioPath(), (await ioText()).replace("axis.valve.coil_12", "axis.valve.ghost"));
    const result = await runCli(["validate", folder]);
    expect(result.stderr).toContain("io.json: modules[0].channels[1].tag: ");
    expect(result.stdout).not.toContain("canonical form");
  });

  it("notes unmapped tags without failing", async () => {
    await runCli(["io", "init", folder]);
    const document = await ioJson();
    document.modules[0].channels.splice(0, 2);
    await writeFile(ioPath(), JSON.stringify(document, null, 2));
    const result = await runCli(["validate", folder]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `2 tag(s) not mapped in io.json: ${AXIS_TAGS.slice(2).join(", ")}.`,
    );
  });
});
