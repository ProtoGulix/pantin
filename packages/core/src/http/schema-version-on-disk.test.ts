import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

const NO_PHASE_6 = { belts: [], guides: [], emitters: [], absorbers: [], presenceSensors: [] };

describe("schema version 1 on disk", () => {
  it("opens a version 1 pantin.json and saves it in the current version", async () => {
    const folder = join(workspace.pantinsDirectory, "legacy");
    await mkdir(join(folder, "meshes"), { recursive: true });
    await writeFile(
      join(folder, "pantin.json"),
      JSON.stringify({ schema_version: 1, name: "Legacy", bodies: [] }),
    );
    const opened = await sendRaw(server, "GET", "/api/pantins/legacy");
    expect(opened.json).toMatchObject({
      unsavedChanges: false,
      document: { schema_version: PANTIN_SCHEMA_VERSION, joints: [] },
    });
    await sendRaw(server, "POST", "/api/pantins/legacy/save");
    const onDisk: unknown = JSON.parse(await readFile(join(folder, "pantin.json"), "utf8"));
    expect(onDisk).toEqual({
      schema_version: PANTIN_SCHEMA_VERSION,
      name: "Legacy",
      assemblies: [
        {
          key: "main",
          name: "main",
          placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
      ],
      bodies: [],
      joints: [],
      drives: [],
      actuators: [],
      sensors: [],
      ...NO_PHASE_6,
    });
  });

  it("answers 409 for a newer schema version", async () => {
    const folder = join(workspace.pantinsDirectory, "future");
    await mkdir(folder);
    await writeFile(
      join(folder, "pantin.json"),
      JSON.stringify({ schema_version: PANTIN_SCHEMA_VERSION + 1, name: "F", bodies: [] }),
    );
    const response = await sendRaw(server, "GET", "/api/pantins/future");
    expect(response.status).toBe(409);
    expect(response.body).toContain("newer than this core supports");
  });
});
