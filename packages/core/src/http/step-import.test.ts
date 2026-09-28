import { access, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImportBodiesResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FakeConverterBehaviour,
  MINIMAL_STEP_TEXT,
  TWO_COMPONENTS,
  writeFakeConverter,
} from "../test-support/fake-step-converter.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { PantinServerOptions, RunningPantinServer } from "./server.ts";

const STEP_BYTES = new TextEncoder().encode(MINIMAL_STEP_TEXT);

let workspace: TestWorkspace;
let converterDirectory: string;
let server: RunningPantinServer | undefined;
let loggedDetails: string[];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  converterDirectory = join(workspace.root, "converter");
  await mkdir(converterDirectory);
  loggedDetails = [];
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await workspace.remove();
});

async function startWith(
  behaviour: FakeConverterBehaviour,
  overrides: Partial<PantinServerOptions> = {},
): Promise<RunningPantinServer> {
  const stepConverterPython = await writeFakeConverter(converterDirectory, behaviour);
  server = await startTestServer(workspace.pantinsDirectory, {
    stepConverterPython,
    reportError: (error) => loggedDetails.push(String(error)),
    ...overrides,
  });
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  return server;
}

function importStep(running: RunningPantinServer): Promise<RawResponse> {
  return importMesh(running, "axis", "fileName=axis%20800.stp", STEP_BYTES);
}

const meshesDirectory = () => join(workspace.pantinsDirectory, "axis", "meshes");

async function expectNothingImported(running: RunningPantinServer): Promise<void> {
  const pantin = await sendRaw(running, "GET", "/api/pantins/axis");
  expect(pantin.json).toMatchObject({ document: { bodies: [] }, unsavedChanges: false });
  expect(await readdir(meshesDirectory())).toEqual([]);
}

async function expectTemporaryDirectoryRemoved(): Promise<void> {
  const outputDirectory = await readFile(join(converterDirectory, "output-dir"), "utf8");
  await expect(access(outputDirectory)).rejects.toThrow(/ENOENT/);
}

describe("STEP import success", () => {
  it("creates one body per component with verbatim names, unique ids and GLB files", async () => {
    const running = await startWith("success");
    const response = await importStep(running);
    expect(response.status).toBe(201);
    const { bodies } = ImportBodiesResponseSchema.parse(response.json);
    expect(bodies.map((body) => body.id)).toEqual(["carriage-3630-00", "carriage-3630-00-2"]);
    expect(bodies[0]).toEqual({
      id: "carriage-3630-00",
      name: "Carriage 3630.00",
      source: {
        fileName: "axis 800.stp",
        format: "step",
        unit: "m",
        upAxis: "z",
        nodes: TWO_COMPONENTS.components[0]?.nodes,
      },
      mesh: "meshes/carriage-3630-00.glb",
    });
    expect(bodies[1]?.source.nodes).toEqual(TWO_COMPONENTS.components[1]?.nodes);
    expect((await readdir(meshesDirectory())).sort()).toEqual([
      "carriage-3630-00-2.glb",
      "carriage-3630-00.glb",
    ]);
    const mesh = await sendRaw(running, "GET", "/api/pantins/axis/meshes/carriage-3630-00.glb");
    expect(mesh.contentType).toBe("model/gltf-binary");
    await expectTemporaryDirectoryRemoved();
  });
});

describe("STEP import failures are all or nothing", () => {
  it.each<[FakeConverterBehaviour, RegExp]>([
    ["refusal", /could not be converted: The file contains no solid/],
    ["crash", /core logs have the details/],
    ["invalidJson", /core logs have the details/],
    ["escapingFileName", /core logs have the details/],
    ["missingSecondFile", /did not produce "1.glb"/],
    ["secondFileNotGlb", /"1.glb", which is not a GLB/],
  ])("%s -> conversion_failed", async (behaviour, message) => {
    const running = await startWith(behaviour);
    const response = await importStep(running);
    expect(response.status).toBe(422);
    expect(response.json).toMatchObject({ error: { code: "conversion_failed" } });
    expect(response.json).toMatchObject({ error: { message: expect.stringMatching(message) } });
    await expectNothingImported(running);
    await expectTemporaryDirectoryRemoved();
  });

  it("logs crash details server side only", async () => {
    const running = await startWith("crash");
    const response = await importStep(running);
    expect(response.body).not.toContain("Segmentation fault");
    expect(loggedDetails.join("\n")).toContain("Segmentation fault in BRepMesh");
  });

  it("stops a converter whose output is too large", async () => {
    const running = await startWith("oversizedOutput", {
      stepConverterLimits: { maxOutputBytes: 1024 },
    });
    const response = await importStep(running);
    expect(response.json).toMatchObject({ error: { code: "conversion_failed" } });
    expect(loggedDetails.join("\n")).toContain("exceeded its size limit");
  });

  it("kills a hanging converter (SIGKILL after an ignored SIGTERM)", async () => {
    const running = await startWith("hang", {
      stepConverterLimits: { timeLimitMs: 300, killGraceMs: 100 },
    });
    const response = await importStep(running);
    expect(response.json).toMatchObject({
      error: { code: "conversion_failed", message: expect.stringContaining("took longer than") },
    });
    const pid = Number(await readFile(join(converterDirectory, "pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
    await expectNothingImported(running);
    await expectTemporaryDirectoryRemoved();
  });
});

describe("STEP converter availability", () => {
  it("answers conversion_unavailable with setup instructions when no converter is configured", async () => {
    server = await startTestServer(workspace.pantinsDirectory);
    await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
    const response = await importStep(server);
    expect(response.status).toBe(503);
    expect(response.json).toMatchObject({ error: { code: "conversion_unavailable" } });
    expect(response.body).toContain("--step-converter-python");
    expect(response.body).toContain("packages/step-converter/setup.sh");
  });

  it("answers conversion_unavailable when the python cannot be started", async () => {
    server = await startTestServer(workspace.pantinsDirectory, {
      stepConverterPython: join(workspace.root, "no-such-python"),
      reportError: (error) => loggedDetails.push(String(error)),
    });
    await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
    const response = await importStep(server);
    expect(response.json).toMatchObject({ error: { code: "conversion_unavailable" } });
    expect(loggedDetails.join("\n")).toContain("ENOENT");
  });
});
