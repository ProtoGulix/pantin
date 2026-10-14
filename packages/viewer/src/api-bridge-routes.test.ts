import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import { bridgeStatusOf } from "./bridge/bridge-fixtures.ts";

// The bridge routes (ADR 0050 point 5).

function sent(request: { init: RequestInit | undefined; url: string } | undefined) {
  return [request?.init?.method, request?.url, request?.init?.body];
}

describe("PantinApiClient bridge", () => {
  it("reads the status with GET and validates it", async () => {
    const status = bridgeStatusOf();
    const { fetchFunction, requests } = fakeFetch(jsonResponse(status));
    expect(await createPantinApiClient(fetchFunction).getBridge("press")).toEqual(status);
    expect(sent(requests[0])).toEqual(["GET", "/api/pantins/press/bridge", undefined]);
  });

  it("starts with PUT { running, listen, allow }", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(bridgeStatusOf()));
    await createPantinApiClient(fetchFunction).setBridge("press", {
      running: true,
      listen: "192.168.56.1",
      allow: ["192.168.56.0/24"],
    });
    expect(sent(requests[0])).toEqual([
      "PUT",
      "/api/pantins/press/bridge",
      '{"running":true,"listen":"192.168.56.1","allow":["192.168.56.0/24"]}',
    ]);
  });

  it("stops with PUT { running: false }", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(bridgeStatusOf()));
    await createPantinApiClient(fetchFunction).setBridge("press", { running: false });
    expect(sent(requests[0])).toEqual(["PUT", "/api/pantins/press/bridge", '{"running":false}']);
  });

  it("refuses a start the protocol forbids, without a request", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(bridgeStatusOf()));
    const error = await captureError(
      createPantinApiClient(fetchFunction).setBridge("press", {
        running: true,
        listen: "",
        allow: [],
      }),
    );
    expect([error.kind, requests]).toEqual(["invalid_input", []]);
  });

  it("rejects an answer that breaks the contract", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ state: "running" }));
    const error = await captureError(createPantinApiClient(fetchFunction).getBridge("press"));
    expect(error.kind).toBe("invalid_response");
  });
});
