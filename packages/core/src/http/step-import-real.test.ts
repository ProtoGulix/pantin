import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FaceFileSchema, faceFilePathOf, ImportBodiesResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// End to end with the real Python converter of packages/step-converter
// (ADR 0009). It needs that package's environment, so it only runs when
// PANTIN_STEP_CONVERTER_PYTHON points to its interpreter; CI always sets it.
const converterPython = process.env.PANTIN_STEP_CONVERTER_PYTHON;

// Synthetic assembly "fixture_axis" (components "rail" and "carriage", in mm),
// committed as is. It was written once by the `axis_step` builder of
// packages/step-converter/tests/conftest.py (build the document with
// `_new_document`, `_named` and `_add_axis`, then `_write_document`); rerun that
// builder to regenerate it after a change of the fixture geometry.
const FIXTURE_PATH = join(import.meta.dirname, "../test-support/fixtures/axis-assembly.step");

let workspace: TestWorkspace;
let server: RunningPantinServer | undefined;

beforeEach(async () => {
  workspace = await createTestWorkspace();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await workspace.remove();
});

describe.skipIf(converterPython === undefined)("STEP import with the real converter", () => {
  it("creates one body per component, with verbatim names, GLB meshes and face files", async () => {
    server = await startTestServer(workspace.pantinsDirectory, {
      stepConverterPython: converterPython ?? "",
    });
    await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });

    const bytes = new Uint8Array(await readFile(FIXTURE_PATH));
    const response = await importMesh(server, "axis", "fileName=axis-assembly.step", bytes);

    expect(response.status).toBe(201);
    const { bodies } = ImportBodiesResponseSchema.parse(response.json);
    expect(bodies.map((body) => body.name)).toEqual(["rail", "carriage"]);
    expect(bodies.map((body) => body.source.nodes)).toEqual([
      [
        { name: "fixture_axis", path: [0] },
        { name: "rail", path: [0, 0] },
      ],
      [
        { name: "fixture_axis", path: [0] },
        { name: "carriage", path: [0, 1] },
      ],
    ]);
    for (const body of bodies) {
      expect(body.source).toMatchObject({ format: "step", unit: "m", upAxis: "z" });
      const mesh = await readFile(join(workspace.pantinsDirectory, "axis", body.mesh));
      expect(mesh.subarray(0, 4).toString("latin1")).toBe("glTF");
      // Both components are boxes: six plane faces each (ADR 0035).
      const faceFilePath = join(
        workspace.pantinsDirectory,
        "axis",
        faceFilePathOf(body.mesh) ?? "",
      );
      const faceFile = FaceFileSchema.parse(JSON.parse(await readFile(faceFilePath, "utf8")));
      expect(faceFile.solid).toBe(true);
      expect(faceFile.faces.map((face) => face.kind)).toEqual(Array(6).fill("plane"));
    }
  }, 60_000);
});
