import { cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ExampleListResponseSchema,
  type PantinListResponse,
  PantinListResponseSchema,
  PantinResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { PantinServerOptions, RunningPantinServer } from "./server.ts";

// Open an example (ADR 0062): the listing checks and the copy.

const REPOSITORY_EXAMPLES = join(import.meta.dirname, "../../../../examples");

let workspace: TestWorkspace;
let examplesDirectory: string;
let server: RunningPantinServer | undefined;
let reportedProblems: string[];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  examplesDirectory = join(workspace.root, "examples");
  await mkdir(examplesDirectory);
  reportedProblems = [];
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await workspace.remove();
});

async function start(overrides: Partial<PantinServerOptions> = {}): Promise<RunningPantinServer> {
  server = await startTestServer(workspace.pantinsDirectory, {
    examplesDirectory,
    reportError: (error) => reportedProblems.push(String(error)),
    ...overrides,
  });
  return server;
}

async function installExample(name: string, source = "axis"): Promise<string> {
  const folder = join(examplesDirectory, name);
  await cp(join(REPOSITORY_EXAMPLES, source), folder, { recursive: true });
  return folder;
}

async function editDocument(folder: string, edit: (json: Record<string, unknown>) => void) {
  const path = join(folder, "pantin.json");
  const json = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  edit(json);
  await writeFile(path, JSON.stringify(json));
}

async function listedIds(running: RunningPantinServer): Promise<string[]> {
  const response = await sendRaw(running, "GET", "/api/examples");
  expect(response.status).toBe(200);
  return ExampleListResponseSchema.parse(response.json).examples.map((example) => example.id);
}

function copy(running: RunningPantinServer, exampleId: string, body: unknown = {}) {
  return sendJsonRequest(running, "POST", `/api/examples/${exampleId}/copy`, body);
}

async function pantinFolders(): Promise<string[]> {
  return (await readdir(workspace.pantinsDirectory)).filter((name) => !name.startsWith("."));
}

describe("the examples of the repository", () => {
  it("lists every example of examples/ with its name and body count", async () => {
    examplesDirectory = REPOSITORY_EXAMPLES;
    const response = await sendRaw(await start(), "GET", "/api/examples");
    expect(ExampleListResponseSchema.parse(response.json).examples).toEqual([
      { id: "axis", name: expect.any(String), bodyCount: 2 },
      { id: "plc-cylinder", name: expect.any(String), bodyCount: 3 },
    ]);
    expect(reportedProblems).toEqual([]);
  });

  it("copies plc-cylinder with its io.json, its meshes and no README", async () => {
    examplesDirectory = REPOSITORY_EXAMPLES;
    const response = await copy(await start(), "plc-cylinder");
    expect(response.status).toBe(201);
    expect(PantinResponseSchema.parse(response.json).id).toBe("plc-cylinder");
    const folder = join(workspace.pantinsDirectory, "plc-cylinder");
    expect((await readdir(folder)).sort()).toEqual(["io.json", "meshes", "pantin.json"]);
    expect(await readdir(join(folder, "meshes"))).toHaveLength(3);
  });
});

describe("GET /api/examples", () => {
  it("leaves out the files and a folder whose name is not an id, and says why", async () => {
    await installExample("axis");
    await installExample("Not An Id");
    await writeFile(join(examplesDirectory, "README.md"), "docs");
    expect(await listedIds(await start())).toEqual(["axis"]);
    expect(reportedProblems).toEqual([expect.stringContaining('"Not An Id" left out')]);
  });

  it("is empty when examples are disabled, and a copy answers 404", async () => {
    await installExample("axis");
    server = await startTestServer(workspace.pantinsDirectory);
    const running = server;
    expect(await listedIds(running)).toEqual([]);
    const response = await copy(running, "axis");
    expect(response.status).toBe(404);
    expect(await pantinFolders()).toEqual([]);
  });

  it("leaves out an example with an invalid pantin.json or io.json", async () => {
    await installExample("axis");
    const brokenDocument = await installExample("broken-document");
    await writeFile(join(brokenDocument, "pantin.json"), "{ not json");
    const brokenIo = await installExample("broken-io", "plc-cylinder");
    await writeFile(join(brokenIo, "io.json"), '{"schema_version": 999}');
    expect(await listedIds(await start())).toEqual(["axis"]);
    expect(reportedProblems).toEqual([
      expect.stringContaining('"broken-document" left out'),
      expect.stringContaining('"broken-io" left out'),
    ]);
  });
});

describe("example files that must be refused", () => {
  it("leaves out an example whose mesh is a symbolic link", async () => {
    const folder = await installExample("linked");
    await rm(join(folder, "meshes", "rail.stl"));
    await symlink(join(folder, "meshes", "carriage.stl"), join(folder, "meshes", "rail.stl"));
    await installExample("axis");
    const running = await start();
    expect(await listedIds(running)).toEqual(["axis"]);
    expect(reportedProblems).toEqual([expect.stringContaining("not a regular file")]);
    expect((await copy(running, "linked")).status).toBe(404);
    expect(await pantinFolders()).toEqual([]);
  });

  it("refuses a mesh path that escapes the folder", async () => {
    await writeFile(join(workspace.root, "outside.stl"), "outside");
    const folder = await installExample("escaping");
    await editDocument(folder, (json) => {
      const [firstBody] = json.bodies as { mesh: string }[];
      if (firstBody !== undefined) {
        firstBody.mesh = "meshes/../../../outside.stl";
      }
    });
    const running = await start();
    expect(await listedIds(running)).toEqual([]);
    expect(reportedProblems).toEqual([expect.stringContaining("must be meshes/<file name>")]);
    expect((await copy(running, "escaping")).status).toBe(404);
  });

  it("neither lists nor copies an example folder that is a link", async () => {
    const elsewhere = join(workspace.root, "elsewhere");
    await cp(join(REPOSITORY_EXAMPLES, "axis"), elsewhere, { recursive: true });
    await symlink(elsewhere, join(examplesDirectory, "linked"));
    const running = await start();
    expect(await listedIds(running)).toEqual([]);
    expect((await copy(running, "linked")).status).toBe(404);
    expect(await pantinFolders()).toEqual([]);
  });

  it("logs a left-out example once, not at every listing", async () => {
    const folder = await installExample("broken");
    await writeFile(join(folder, "pantin.json"), "{ not json");
    const running = await start();
    await listedIds(running);
    await listedIds(running);
    expect(reportedProblems).toHaveLength(1);
  });

  it("refuses a meshes folder that is a link to elsewhere", async () => {
    const folder = await installExample("redirected");
    const elsewhere = join(workspace.root, "elsewhere");
    await rename(join(folder, "meshes"), elsewhere);
    await symlink(elsewhere, join(folder, "meshes"));
    const running = await start();
    expect(await listedIds(running)).toEqual([]);
    expect(reportedProblems).toEqual([expect.stringContaining("leads outside its example folder")]);
  });

  it("refuses a mesh larger than the import limit", async () => {
    const folder = await installExample("heavy");
    await writeFile(join(folder, "meshes", "rail.stl"), "x".repeat(3000));
    await installExample("axis");
    const running = await start({ maxImportBytes: 2000 });
    expect(await listedIds(running)).toEqual(["axis"]);
    expect(reportedProblems).toEqual(
      expect.arrayContaining([expect.stringContaining("larger than 2000")]),
    );
  });
});

describe("POST /api/examples/:exampleId/copy", () => {
  it("copies the meshes and pantin.json, opens the copy and leaves the README behind", async () => {
    await installExample("axis");
    const running = await start();
    const response = await copy(running, "axis");
    expect(response.status).toBe(201);
    const pantin = PantinResponseSchema.parse(response.json);
    expect(pantin.id).toBe("axis");
    expect(pantin.unsavedChanges).toBe(false);
    const folder = join(workspace.pantinsDirectory, "axis");
    expect((await readdir(folder)).sort()).toEqual(["meshes", "pantin.json"]);
    expect((await readdir(join(folder, "meshes"))).sort()).toEqual(["carriage.stl", "rail.stl"]);
    expect((await sendRaw(running, "GET", "/api/pantins/axis/meshes/rail.stl")).status).toBe(200);
    const listing = PantinListResponseSchema.parse(
      (await sendRaw(running, "GET", "/api/pantins")).json,
    ) satisfies PantinListResponse;
    expect(listing.pantins.map((summary) => summary.id)).toEqual(["axis"]);
  });

  it("names a second copy axis-2 and uses the requested name", async () => {
    await installExample("axis");
    const running = await start();
    await copy(running, "axis");
    const second = PantinResponseSchema.parse((await copy(running, "axis")).json);
    expect(second.id).toBe("axis-2");
    const named = PantinResponseSchema.parse(
      (await copy(running, "axis", { name: "Line 7" })).json,
    );
    expect(named.id).toBe("line-7");
    expect(named.document.name).toBe("Line 7");
    const onDisk = JSON.parse(
      await readFile(join(workspace.pantinsDirectory, "line-7", "pantin.json"), "utf8"),
    ) as { name: string };
    expect(onDisk.name).toBe("Line 7");
  });

  it("answers 404 for an unknown example and 400 for an id that is not one", async () => {
    await installExample("axis");
    const running = await start();
    expect((await copy(running, "nothing")).status).toBe(404);
    expect((await copy(running, "..")).status).toBe(400);
    expect((await copy(running, "%2e%2e")).status).toBe(400);
    expect([400, 404]).toContain((await copy(running, "a%2Fb")).status);
    expect((await copy(running, "axis", { name: "" })).status).toBe(400);
    expect(await pantinFolders()).toEqual([]);
  });

  it("checks the files again at copy time", async () => {
    const folder = await installExample("axis");
    const running = await start();
    expect(await listedIds(running)).toEqual(["axis"]);
    await rm(join(folder, "meshes", "rail.stl"));
    await symlink(join(folder, "meshes", "carriage.stl"), join(folder, "meshes", "rail.stl"));
    expect((await copy(running, "axis")).status).toBe(404);
    expect(await pantinFolders()).toEqual([]);
  });
});
