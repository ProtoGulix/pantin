import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Orphan mesh routes (ADR 0038).

const list = {
  files: [
    { fileName: "a.glb", sizeInBytes: 1190116 },
    { fileName: "a.faces.json", sizeInBytes: 20 },
  ],
  totalSizeInBytes: 1190136,
};

describe("PantinApiClient orphan meshes", () => {
  it("gets the list from the pantin's orphan-meshes route", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(list));
    const result = await createPantinApiClient(fetchFunction).listOrphanMeshes("press");
    expect(requests[0]?.url).toBe("/api/pantins/press/orphan-meshes");
    expect(requests[0]?.init?.method).toBe("GET");
    expect(result).toEqual(list);
  });

  it("posts the names as JSON to the delete route and parses the outcomes", async () => {
    const answer = {
      deleted: [{ fileName: "a.glb", sizeInBytes: 12 }],
      skipped: ["b.glb"],
      failed: [{ fileName: "c.stl", errorCode: "EACCES" }],
    };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    const result = await createPantinApiClient(fetchFunction).deleteOrphanMeshes("press", [
      "a.glb",
      "b.glb",
    ]);
    expect(requests[0]?.url).toBe("/api/pantins/press/orphan-meshes/delete");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ fileNames: ["a.glb", "b.glb"] });
    expect(result).toEqual(answer);
  });

  it("refuses a name that is a path, or 201 names, before any request", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse({}));
    const client = createPantinApiClient(fetchFunction);
    expect((await captureError(client.deleteOrphanMeshes("press", ["../x"]))).kind).toBe(
      "invalid_input",
    );
    const tooMany = Array.from({ length: 201 }, (_, index) => `f${index}.glb`);
    expect((await captureError(client.deleteOrphanMeshes("press", tooMany))).kind).toBe(
      "invalid_input",
    );
    expect(requests).toEqual([]);
  });

  it("refuses an answer that does not match the schema", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ files: [] }));
    const error = await captureError(createPantinApiClient(fetchFunction).listOrphanMeshes("p"));
    expect(error.kind).toBe("invalid_response");
  });
});
