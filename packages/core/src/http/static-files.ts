import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";
import { ApiError } from "../errors.ts";
import { assertRealPathInside, isErrorWithCode, resolveInside } from "../store/safe-paths.ts";

// Serves the built viewer (ADR 0008). Only files whose extension is listed
// here are served, with this exact content type.
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

function notFound(path: string): ApiError {
  return new ApiError("not_found", `No viewer file at "${path}". Open / to load the viewer.`);
}

// Segments come from parseRequestTarget, already decoded: "..", "." and any
// separator inside a segment would change the directory, so they are refused.
function relativeFilePath(segments: readonly string[]): string | undefined {
  if (segments.length === 0) {
    return "index.html";
  }
  const isSafe = segments.every(
    (segment) => segment !== "." && segment !== ".." && !/[\\/\0]/.test(segment),
  );
  return isSafe ? segments.join("/") : undefined;
}

export async function serveViewerFile(
  viewerDirectory: string,
  segments: readonly string[],
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    throw new ApiError(
      "invalid_request",
      `Method ${method} is not allowed on viewer files. Use GET.`,
      405,
    );
  }
  const displayPath = `/${segments.join("/")}`;
  const relativePath = relativeFilePath(segments);
  const contentType = relativePath === undefined ? undefined : CONTENT_TYPES[extname(relativePath)];
  if (relativePath === undefined || contentType === undefined) {
    throw notFound(displayPath);
  }
  const path = resolveInside(viewerDirectory, relativePath);
  try {
    // lstat, not stat: a symbolic link is never served, wherever it points.
    const stats = await lstat(path);
    if (!stats.isFile()) {
      throw notFound(displayPath);
    }
    await assertRealPathInside(viewerDirectory, path);
    // The page is checked again at every load, so that a rebuilt viewer is
    // never hidden behind an old one; bundled assets carry a content hash in
    // their name and may stay cached.
    const cache = relativePath.endsWith(".html") ? { "cache-control": "no-cache" } : {};
    response.writeHead(200, {
      "content-type": contentType,
      "content-length": stats.size,
      ...cache,
    });
    if (method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(path);
    stream.on("error", (error) => response.destroy(error));
    stream.pipe(response);
  } catch (error) {
    throw isErrorWithCode(error, "ENOENT") || isErrorWithCode(error, "ENOTDIR")
      ? notFound(displayPath)
      : error;
  }
}
