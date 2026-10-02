import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AlignResponseSchema,
  type FaceFile,
  ImportBodiesResponseSchema,
  type Placement,
} from "@pantin/protocol";
import { afterEach, beforeEach, expect } from "vitest";
import type { Vector3 } from "../domain/rigid-transform.ts";
import type { RunningPantinServer } from "../http/server.ts";
import { buildSampleGlb } from "./mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// The bench of the alignment tests (ADR 0035): a block with two holes 40 mm
// apart, to be mounted on a base with two holes 40 mm apart, like the exit
// criterion of the ADR. Face files are written by hand next to two GLB
// bodies, each imported in its own assembly.

const BLOCK_FACES: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [],
  faces: [
    { kind: "plane", point: [0, 0, 0], normal: [0, 0, -1] },
    { kind: "cylinder", point: [0.01, 0, 0], direction: [0, 0, 1], radius: 0.0027 },
    { kind: "cylinder", point: [0.05, 0, 0], direction: [0, 0, -1], radius: 0.0027 },
  ],
};

export const BASE_FACES: FaceFile = {
  formatVersion: 1,
  writer: "test",
  solid: true,
  primitives: [],
  faces: [
    { kind: "plane", point: [0, 0, 0.1], normal: [0, 0, 1] },
    { kind: "cylinder", point: [0.3, 0.2, 0], direction: [0, 0, 1], radius: 0.0025 },
    { kind: "cylinder", point: [0.3, 0.24, 0], direction: [0, 0, 1], radius: 0.0025 },
  ],
};

// Imports a GLB body `name` in its own assembly, its face file next to it.
async function importWithFaces(
  server: RunningPantinServer,
  workspace: TestWorkspace,
  name: string,
  faces: FaceFile,
): Promise<void> {
  const response = await importMesh(server, "bench", `fileName=${name}.glb`, buildSampleGlb());
  const [body] = ImportBodiesResponseSchema.parse(response.json).bodies;
  expect(body?.id).toBe(name);
  const directory = join(workspace.pantinsDirectory, "bench", "meshes");
  await writeFile(join(directory, `${name}.faces.json`), JSON.stringify(faces));
}

export type AlignmentBench = {
  server: () => RunningPantinServer;
  workspace: () => TestWorkspace;
  importWithFaces: (name: string, faces: FaceFile) => Promise<void>;
  align: (request: unknown) => Promise<RawResponse>;
  alignedPlacement: (request: unknown) => Promise<Placement>;
};

// Registers the setup and teardown of each test; call it at the top of a file.
export function useAlignmentBench(): AlignmentBench {
  let workspace: TestWorkspace | undefined;
  let server: RunningPantinServer | undefined;
  const required = <Value>(value: Value | undefined): Value => {
    if (value === undefined) {
      throw new Error("The alignment bench runs only inside a test.");
    }
    return value;
  };
  const bench: AlignmentBench = {
    server: () => required(server),
    workspace: () => required(workspace),
    importWithFaces: (name, faces) =>
      importWithFaces(required(server), required(workspace), name, faces),
    align: (request) =>
      sendJsonRequest(
        required(server),
        "POST",
        "/api/pantins/bench/assemblies/block/align",
        request,
      ),
    alignedPlacement: async (request) => {
      const response = await bench.align(request);
      expect(response.status).toBe(200);
      return AlignResponseSchema.parse(response.json).placement;
    },
  };
  beforeEach(async () => {
    workspace = await createTestWorkspace();
    server = await startTestServer(workspace.pantinsDirectory);
    await sendJsonRequest(server, "POST", "/api/pantins", { name: "Bench" });
    await bench.importWithFaces("block", BLOCK_FACES);
    await bench.importWithFaces("base", BASE_FACES);
  });
  afterEach(async () => {
    await server?.close();
    await workspace?.remove();
  });
  return bench;
}

export function face(body: string, index: number, point: Vector3) {
  return { kind: "face", body, face: index, point };
}

export function expectPoint(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 9);
  });
}
