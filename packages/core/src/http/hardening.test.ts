import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import { BodyResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl, buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  SENTINEL_CONTENT,
  sendJsonRequest,
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
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Secret machine" });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

function getWithHost(host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { host: "127.0.0.1", port: server.address.port, path: "/api/pantins", headers: { host } },
      (incoming) => {
        let body = "";
        incoming.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, body }));
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

// HTTP/1.0 allows a request without Host, which node:http clients never send.
function getWithoutHost(): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(server.address.port, "127.0.0.1", () => {
      socket.write("GET /api/pantins HTTP/1.0\r\n\r\n");
    });
    let received = "";
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(received));
    socket.on("error", reject);
  });
}

describe("host check against DNS rebinding", () => {
  it("rejects a foreign Host without returning Pantin data", async () => {
    const response = await getWithHost(`evil.example:${server.address.port}`);
    expect(response.status).toBe(421);
    expect(response.body).toContain("invalid_request");
    expect(response.body).not.toContain("Secret machine");
  });

  it("rejects a missing Host and a local name with the wrong port", async () => {
    expect(await getWithoutHost()).toMatch(/^HTTP\/1\.1 421/);
    expect((await getWithHost("localhost:1")).status).toBe(421);
  });

  it.each(["localhost", "127.0.0.1", "LOCALHOST"])(
    "accepts %s with the server port",
    async (name) => {
      const response = await getWithHost(`${name}:${server.address.port}`);
      expect(response.status).toBe(200);
      expect(response.body).toContain("Secret machine");
    },
  );
});

describe("response headers", () => {
  it("sends nosniff on JSON, errors and meshes", async () => {
    await importMesh(server, "secret-machine", "fileName=rail.stl&unit=mm", buildAsciiStl());
    for (const path of [
      "/api/pantins",
      "/api/nothing",
      "/api/pantins/secret-machine/meshes/rail.stl",
    ]) {
      const headers = await new Promise<Record<string, unknown>>((resolve) => {
        httpRequest({ host: "127.0.0.1", port: server.address.port, path }, (incoming) => {
          incoming.resume();
          resolve(incoming.headers);
        }).end();
      });
      expect(headers["x-content-type-options"]).toBe("nosniff");
    }
  });
});

describe("concurrent imports", () => {
  it("gives two simultaneous imports of the same file distinct ids and files", async () => {
    const glb = buildSampleGlb();
    const responses = await Promise.all([
      importMesh(server, "secret-machine", "fileName=rail.glb", glb),
      importMesh(server, "secret-machine", "fileName=rail.glb", glb),
    ]);
    const ids = responses.map((response) => BodyResponseSchema.parse(response.json).body.id);
    expect(ids.sort()).toEqual(["rail", "rail-2"]);
    const meshes = join(workspace.pantinsDirectory, "secret-machine", "meshes");
    expect((await readdir(meshes)).sort()).toEqual(["rail-2.glb", "rail.glb"]);
  });
});

describe("symbolic links", () => {
  const meshesOf = () => join(workspace.pantinsDirectory, "secret-machine", "meshes");

  it("never serves a mesh replaced by a link to a file outside", async () => {
    await importMesh(server, "secret-machine", "fileName=rail.stl&unit=mm", buildAsciiStl());
    await rm(join(meshesOf(), "rail.stl"));
    await symlink(workspace.sentinelPath, join(meshesOf(), "rail.stl"));
    const response = await sendRaw(server, "GET", "/api/pantins/secret-machine/meshes/rail.stl");
    expect(response.status).toBe(404);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
  });

  it("never writes through a link planted in meshes/", async () => {
    await symlink(workspace.sentinelPath, join(meshesOf(), "bracket.stl"));
    const response = await importMesh(
      server,
      "secret-machine",
      "fileName=bracket.stl&unit=mm",
      buildAsciiStl(),
    );
    expect(response.status).toBe(201);
    expect(await readFile(workspace.sentinelPath, "utf8")).toBe(SENTINEL_CONTENT);
  });

  it("refuses a Pantin folder that links outside the pantins directory", async () => {
    const outside = join(workspace.root, "outside");
    await mkdir(outside);
    await writeFile(
      join(outside, "pantin.json"),
      '{"schema_version":1,"name":"Outside","bodies":[]}',
    );
    await symlink(outside, join(workspace.pantinsDirectory, "escape"), "dir");
    const response = await sendRaw(server, "GET", "/api/pantins/escape");
    expect(response.status).toBe(400);
    expect(response.body).toContain("symbolic link");
    expect(response.body).not.toContain("Outside");
  });
});
