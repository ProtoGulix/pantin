import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePantinFolder } from "./validate-folder.ts";

// Phase 1 exit criterion (ADR 0021 point 5): examples/axis is valid, broken
// copies of it are refused with a clear message.

const EXAMPLE = fileURLToPath(new URL("../../../examples/axis", import.meta.url));

let workspace: string;
let copy: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "pantin-validate-"));
  copy = join(workspace, "axis");
  await cp(EXAMPLE, copy, { recursive: true });
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

type Json = Record<string, unknown>;

// The document's arrays, read without a cast: anything else reads as empty.
function list(value: unknown): Json[] {
  return Array.isArray(value) ? value : [];
}

async function editDocument(change: (document: Json) => Json): Promise<void> {
  const path = join(copy, "pantin.json");
  const document: Json = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify(change(document)));
}

describe("validatePantinFolder", () => {
  it("accepts examples/axis", async () => {
    expect(await validatePantinFolder(EXAMPLE)).toEqual({ problems: [], notes: [] });
  });

  it("names a missing mesh file", async () => {
    await rm(join(copy, "meshes", "carriage.stl"));
    expect((await validatePantinFolder(copy)).problems).toEqual([
      'Body "carriage": mesh "meshes/carriage.stl" is missing from the folder.',
    ]);
  });

  it("refuses a mesh path that leaves the folder", async () => {
    await editDocument((document) => ({
      ...document,
      bodies: list(document.bodies).map((body) => ({ ...body, mesh: "../../etc/passwd" })),
    }));
    expect((await validatePantinFolder(copy)).problems[0]).toContain(
      "The requested path leaves the served directory.",
    );
  });

  it("gives one line per broken rule, with where it is", async () => {
    await editDocument((document) => ({
      ...document,
      joints: [{ ...list(document.joints)[0], child: "ghost" }],
      bodies: list(document.bodies).map((body) => ({ ...body, assembly: "lost" })),
    }));
    const { problems } = await validatePantinFolder(copy);
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(problems.join("\n")).toMatch(/references an unknown body/);
    expect(problems.join("\n")).toMatch(/bodies\.0\.assembly: Body "rail" is in assembly "lost"/);
  });
});

describe("validatePantinFolder on unreadable or foreign files", () => {
  it("reports invalid JSON and a missing pantin.json", async () => {
    await writeFile(join(copy, "pantin.json"), "{ not json");
    expect((await validatePantinFolder(copy)).problems[0]).toMatch(/is not valid JSON/);
    expect((await validatePantinFolder(workspace)).problems[0]).toMatch(
      /Is this a Pantin folder\?/,
    );
  });

  it("notes a migration from an older version without writing anything", async () => {
    await editDocument(({ assemblies: _assemblies, ...document }) => ({
      ...document,
      schema_version: 3,
      bodies: list(document.bodies).map(({ assembly: _assembly, ...body }) => body),
      joints: list(document.joints).map(({ tagKey: _tagKey, ...joint }) => joint),
    }));
    const before = await readFile(join(copy, "pantin.json"), "utf8");
    expect(await validatePantinFolder(copy)).toEqual({
      problems: [],
      notes: ["Schema version 3 on disk: the core migrates it on open."],
    });
    expect(await readFile(join(copy, "pantin.json"), "utf8")).toBe(before);
  });

  it("refuses a version newer than this Pantin", async () => {
    await editDocument((document) => ({ ...document, schema_version: 99 }));
    expect((await validatePantinFolder(copy)).problems[0]).toMatch(/newer than this core supports/);
  });
});

describe("validatePantinFolder mesh paths, as strict as the core", () => {
  async function meshOfRail(mesh: string): Promise<void> {
    await editDocument((document) => ({
      ...document,
      bodies: list(document.bodies).map((body) => (body.id === "rail" ? { ...body, mesh } : body)),
    }));
  }

  it("refuses a symbolic link that leads outside the folder", async () => {
    const outside = join(workspace, "outside.stl");
    await writeFile(outside, "solid x\nendsolid x\n");
    await rm(join(copy, "meshes", "rail.stl"));
    await symlink(outside, join(copy, "meshes", "rail.stl"));
    expect((await validatePantinFolder(copy)).problems[0]).toMatch(/symbolic link/);
  });

  it("refuses a directory in place of a mesh file", async () => {
    await meshOfRail("meshes");
    expect((await validatePantinFolder(copy)).problems).toEqual([
      'Body "rail": mesh "meshes" is not a file.',
    ]);
  });

  it("accepts a file name that merely starts with two dots", async () => {
    await cp(join(copy, "meshes", "rail.stl"), join(copy, "..rail.stl"));
    await meshOfRail("..rail.stl");
    expect((await validatePantinFolder(copy)).problems).toEqual([]);
  });
});
