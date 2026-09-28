import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  SENTINEL_CONTENT,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

const INDEX_HTML = "<!doctype html><title>Pantin viewer</title>";

let workspace: TestWorkspace;
let viewerDirectory: string;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  viewerDirectory = join(workspace.root, "viewer");
  await mkdir(join(viewerDirectory, "assets"), { recursive: true });
  await writeFile(join(viewerDirectory, "index.html"), INDEX_HTML);
  await writeFile(join(viewerDirectory, "assets", "app.js"), "console.log('viewer');");
  await writeFile(join(viewerDirectory, "assets", "style.css"), "body{}");
  await writeFile(join(viewerDirectory, "assets", "notes.txt"), "not in the table");
  await symlink(workspace.sentinelPath, join(viewerDirectory, "assets", "leak.js"));
  await writeFile(join(workspace.root, "secret.js"), SENTINEL_CONTENT);
  await symlink(workspace.root, join(viewerDirectory, "outside"), "dir");
  server = await startTestServer(workspace.pantinsDirectory, { viewerDirectory });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

describe("static viewer files", () => {
  it("serves index.html for / with its content type and nosniff", async () => {
    const response = await sendRaw(server, "GET", "/");
    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    expect(response.body).toBe(INDEX_HTML);
  });

  it.each([
    ["/assets/app.js", "text/javascript; charset=utf-8"],
    ["/assets/style.css", "text/css; charset=utf-8"],
    ["/index.html", "text/html; charset=utf-8"],
  ])("serves %s as %s", async (path, contentType) => {
    const response = await sendRaw(server, "GET", path);
    expect(response.status).toBe(200);
    expect(response.contentType).toBe(contentType);
  });

  it("answers HEAD without a body and refuses other methods", async () => {
    const head = await sendRaw(server, "HEAD", "/");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await sendRaw(server, "POST", "/index.html")).status).toBe(405);
  });

  it("keeps the API routes in front of the viewer", async () => {
    const response = await sendRaw(server, "GET", "/api/pantins");
    expect(response.json).toEqual({ pantins: [] });
  });
});

describe("static viewer refusals", () => {
  it.each([
    "/assets/notes.txt",
    "/missing.js",
    "/assets",
    "/../sentinel.stl",
    "/assets/../../sentinel.stl",
    "/..%2Fsentinel.stl",
    "/%2e%2e/sentinel.stl",
    "/%2E%2E%2Fsentinel.stl",
    "/assets%2F..%2F..%2Fsentinel.stl",
    "/..%5Csentinel.stl",
    "/assets/leak.js",
    "/outside/sentinel.stl",
    "/outside/secret.js",
    "/../secret.js",
    "/%2e%2e%2fsecret.js",
    "/outside/pantins",
    "/index.html%00.js",
  ])("never serves %s", async (path) => {
    const response = await sendRaw(server, "GET", path);
    expect([400, 404]).toContain(response.status);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
  });

  it("does not serve viewer files when no viewer directory is configured", async () => {
    const apiOnly = await startTestServer(workspace.pantinsDirectory);
    const response = await sendRaw(apiOnly, "GET", "/");
    await apiOnly.close();
    expect(response.status).toBe(404);
  });
});
