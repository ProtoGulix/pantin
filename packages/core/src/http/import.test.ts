import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl, buildBinaryStl, buildGlb } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  singleImportedBody,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

const SMALL_IMPORT_LIMIT = 1024;

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory, {
    maxImportBytes: SMALL_IMPORT_LIMIT,
  });
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Imports" });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

// Sends the body in chunks without Content-Length, so only the streaming
// counter can stop it.
function sendChunked(path: string, chunkCount: number, chunkSize: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: "127.0.0.1",
        port: server.address.port,
        method: "POST",
        path,
        headers: { "content-type": "application/octet-stream", "transfer-encoding": "chunked" },
      },
      (incoming) => {
        incoming.resume();
        resolve(incoming.statusCode ?? 0);
      },
    );
    outgoing.on("error", reject);
    for (let index = 0; index < chunkCount; index += 1) {
      outgoing.write(Buffer.alloc(chunkSize, 0x20));
    }
    outgoing.end();
  });
}

describe("body import", () => {
  it("imports an ASCII STL with its unit and a Z up default", async () => {
    const response = await importMesh(
      server,
      "imports",
      "fileName=Bracket.stl&unit=mm",
      buildAsciiStl(),
    );
    expect(response.status).toBe(201);
    const body = singleImportedBody(response);
    expect(body).toEqual({
      id: "bracket",
      name: "Bracket",
      assembly: "bracket",
      source: { fileName: "Bracket.stl", format: "stl", unit: "mm", upAxis: "z", nodes: [] },
      mesh: "meshes/bracket.stl",
    });
    const written = await readFile(join(workspace.pantinsDirectory, "imports", body.mesh));
    expect(new Uint8Array(written)).toEqual(buildAsciiStl());
  });

  it("imports a binary STL, detected by content whatever the extension", async () => {
    const response = await importMesh(
      server,
      "imports",
      "fileName=plate.bin&unit=cm&upAxis=y",
      buildBinaryStl(2),
    );
    expect(response.status).toBe(201);
    expect(singleImportedBody(response)).toMatchObject({
      mesh: "meshes/plate.stl",
      source: { format: "stl", unit: "cm", upAxis: "y" },
    });
  });
});

describe("import rejections", () => {
  it("rejects an STL without unit", async () => {
    const response = await importMesh(server, "imports", "fileName=bracket.stl", buildAsciiStl());
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({ error: { code: "invalid_request" } });
    expect(response.json).toMatchObject({
      error: { message: expect.stringContaining('"unit" query parameter') },
    });
  });

  it("rejects bytes that are neither GLB nor STL", async () => {
    const bytes = new TextEncoder().encode("PK\u0003\u0004 not a mesh at all");
    const response = await importMesh(server, "imports", "fileName=model.glb", bytes);
    expect(response.status).toBe(415);
    expect(response.json).toMatchObject({ error: { code: "unsupported_file" } });
  });

  it("rejects a GLB whose JSON chunk is broken", async () => {
    const glb = buildGlb({ nodes: [{ name: "a", children: [7] }] });
    const response = await importMesh(server, "imports", "fileName=broken.glb", glb);
    expect(response.json).toMatchObject({ error: { code: "unsupported_file" } });
  });
});

describe("import size limit", () => {
  it("rejects an oversized payload announced by Content-Length", async () => {
    const bytes = new Uint8Array(SMALL_IMPORT_LIMIT + 1);
    const response = await importMesh(server, "imports", "fileName=big.stl&unit=mm", bytes);
    expect(response.status).toBe(413);
    expect(response.json).toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("rejects an oversized chunked payload while streaming", async () => {
    const status = await sendChunked(
      "/api/pantins/imports/bodies?fileName=big.stl&unit=mm",
      8,
      512,
    );
    expect(status).toBe(413);
  });
});

describe("import request checks", () => {
  it("rejects a wrong content type and a missing file name", async () => {
    const wrongType = await sendRaw(
      server,
      "POST",
      "/api/pantins/imports/bodies?fileName=a.stl&unit=mm",
      {
        contentType: "text/plain",
        bytes: buildAsciiStl(),
      },
    );
    expect(wrongType.status).toBe(415);
    const noName = await importMesh(server, "imports", "unit=mm", buildAsciiStl());
    expect(noName.status).toBe(400);
    expect(noName.body).toContain("fileName");
  });

  it("returns not_found when importing into an unknown Pantin", async () => {
    const response = await importMesh(server, "missing", "fileName=a.stl&unit=mm", buildAsciiStl());
    expect(response.status).toBe(404);
  });
});
