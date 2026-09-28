import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  createPantinApiClient,
  type FetchFunction,
  meshFileNameFromPath,
  PantinApiError,
} from "./api-client.ts";

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(response: Response): {
  fetchFunction: FetchFunction;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = async (url, init) => {
    requests.push({ url, init });
    return response;
  };
  return { fetchFunction, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const pantin: PantinResponse = {
  id: "press",
  unsavedChanges: false,
  document: { schema_version: 1, name: "Press", bodies: [] },
};

async function captureError(promise: Promise<unknown>): Promise<PantinApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PantinApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the call to fail.");
}

describe("PantinApiClient responses", () => {
  it("returns a validated Pantin list", async () => {
    const { fetchFunction, requests } = fakeFetch(
      jsonResponse({ pantins: [{ id: "press", name: "Press", bodyCount: 2 }] }),
    );
    const pantins = await createPantinApiClient(fetchFunction).listPantins();
    expect(pantins).toEqual([{ id: "press", name: "Press", bodyCount: 2 }]);
    expect(requests[0]?.url).toBe("/api/pantins");
  });

  it("rejects a response that does not match the contract", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ pantins: [{ id: "../etc", name: "x" }] }));
    const error = await captureError(createPantinApiClient(fetchFunction).listPantins());
    expect(error.kind).toBe("invalid_response");
  });
});

describe("PantinApiClient errors", () => {
  it("turns an ApiErrorResponse into a typed error carrying the core's message", async () => {
    const { fetchFunction } = fakeFetch(
      jsonResponse({ error: { code: "not_found", message: "No Pantin with id press." } }, 404),
    );
    const error = await captureError(createPantinApiClient(fetchFunction).getPantin("press"));
    expect(error).toMatchObject({ kind: "api", code: "not_found", status: 404 });
    expect(error.message).toBe("No Pantin with id press.");
  });

  it("reports an error answer without a valid error body as a contract break", async () => {
    const { fetchFunction } = fakeFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await captureError(createPantinApiClient(fetchFunction).savePantin("press"));
    expect(error).toMatchObject({ kind: "invalid_response", status: 502 });
  });

  it("reports an unreachable core as a network error", async () => {
    const failingFetch: FetchFunction = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await captureError(createPantinApiClient(failingFetch).listPantins());
    expect(error.kind).toBe("network");
  });
});

describe("PantinApiClient requests", () => {
  it("refuses to send an empty name", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin, 201));
    const error = await captureError(createPantinApiClient(fetchFunction).createPantin("   "));
    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  it("sends a rename as JSON with PATCH", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(pantin));
    await createPantinApiClient(fetchFunction).renamePantin("press", "Press");
    expect(requests[0]?.init?.method).toBe("PATCH");
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ name: "Press" }));
  });
});

describe("PantinApiClient import", () => {
  it("sends import bytes raw, with the query in the URL, and returns every body", async () => {
    const component = (id: string) => ({
      id,
      name: id,
      source: { fileName: "rail part.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
      mesh: `meshes/${id}.glb`,
    });
    const bodies = [component("rail"), component("carriage")];
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ bodies }, 201));
    const bytes = new ArrayBuffer(8);
    const imported = await createPantinApiClient(fetchFunction).importBodies(
      "press",
      { fileName: "rail part.step", upAxis: "z" },
      bytes,
    );
    expect(imported).toEqual(bodies);
    expect(requests[0]?.url).toBe("/api/pantins/press/bodies?fileName=rail+part.step&upAxis=z");
    expect(requests[0]?.init?.body).toBe(bytes);
  });

  it("rejects an import answer without any body", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ bodies: [] }, 201));
    const error = await captureError(
      createPantinApiClient(fetchFunction).importBodies(
        "press",
        { fileName: "a.stl" },
        new ArrayBuffer(0),
      ),
    );
    expect(error.kind).toBe("invalid_response");
  });

  it("fetches mesh bytes from the meshes route", async () => {
    const { fetchFunction, requests } = fakeFetch(new Response(new Uint8Array([1, 2, 3])));
    const bytes = await createPantinApiClient(fetchFunction).fetchMeshBytes(
      "press",
      "meshes/rail.glb",
    );
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(requests[0]?.url).toBe("/api/pantins/press/meshes/rail.glb");
  });
});

describe("meshFileNameFromPath", () => {
  it("extracts the file name under meshes/", () => {
    expect(meshFileNameFromPath("meshes/rail.glb")).toBe("rail.glb");
  });

  it.each(["rail.glb", "meshes/", "meshes/a/b.glb", "../meshes/x.glb"])("refuses %s", (path) => {
    expect(() => meshFileNameFromPath(path)).toThrow(PantinApiError);
  });
});
