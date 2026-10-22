import { describe, expect, it } from "vitest";
import { bridgeLogDownloadUrl } from "./api-bridge-routes.ts";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";
import { bridgeStatusOf, opcuaStatusOf } from "./bridge/bridge-fixtures.ts";

// The bridge routes (ADR 0050 point 5).

function sent(request: { init: RequestInit | undefined; url: string } | undefined) {
  return [request?.init?.method, request?.url, request?.init?.body];
}

describe("PantinApiClient bridge", () => {
  it("reads the status with GET and validates it", async () => {
    const status = bridgeStatusOf();
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ bridges: [status] }));
    expect(await createPantinApiClient(fetchFunction).getBridge("press")).toEqual(status);
    expect(sent(requests[0])).toEqual(["GET", "/api/pantins/press/bridges", undefined]);
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
      "/api/pantins/press/bridges/modbus_tcp_slave",
      '{"running":true,"listen":"192.168.56.1","allow":["192.168.56.0/24"]}',
    ]);
  });

  it("stops with PUT { running: false }", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(bridgeStatusOf()));
    await createPantinApiClient(fetchFunction).setBridge("press", { running: false });
    expect(sent(requests[0])).toEqual([
      "PUT",
      "/api/pantins/press/bridges/modbus_tcp_slave",
      '{"running":false}',
    ]);
  });

  it("starts the OPC UA bridge with PUT { running, targets, passwords, trust }", async () => {
    const status = opcuaStatusOf();
    const { fetchFunction, requests } = fakeFetch(jsonResponse(status));
    const answer = await createPantinApiClient(fetchFunction).setOpcuaBridge("press", {
      running: true,
      targets: { plc: "192.168.56.10" },
      passwords: { plc: "secret" },
      trust: ["a".repeat(64)],
    });
    expect(answer).toEqual(status);
    expect(sent(requests[0])).toEqual([
      "PUT",
      "/api/pantins/press/bridges/opcua_client",
      JSON.stringify({
        running: true,
        targets: { plc: "192.168.56.10" },
        passwords: { plc: "secret" },
        trust: ["a".repeat(64)],
      }),
    ]);
  });

  it("refuses an OPC UA trust that is not a SHA-256, without a request", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(opcuaStatusOf()));
    const error = await captureError(
      createPantinApiClient(fetchFunction).setOpcuaBridge("press", {
        running: true,
        targets: {},
        trust: ["abc"],
      }),
    );
    expect([error.kind, requests]).toEqual(["invalid_input", []]);
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

  it("fails clearly when the core's list has no Modbus bridge", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ bridges: [] }));
    await expect(createPantinApiClient(fetchFunction).getBridge("press")).rejects.toThrow(
      "no Modbus bridge",
    );
  });

  it("rejects an answer that breaks the contract", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ state: "running" }));
    const error = await captureError(createPantinApiClient(fetchFunction).getBridge("press"));
    expect(error.kind).toBe("invalid_response");
  });
});

describe("PantinApiClient bridge log", () => {
  it("reads the log as text with GET", async () => {
    const { fetchFunction, requests } = fakeFetch(new Response("line one\nline two\n"));
    const text = await createPantinApiClient(fetchFunction).getBridgeLog("press");
    expect(text).toBe("line one\nline two\n");
    expect(sent(requests[0])).toEqual([
      "GET",
      "/api/pantins/press/bridges/modbus_tcp_slave/log",
      undefined,
    ]);
  });

  it("raises the core's error when the log cannot be read", async () => {
    const body = { error: { code: "not_found", message: "No such Pantin." } };
    const { fetchFunction } = fakeFetch(jsonResponse(body, 404));
    const error = await captureError(createPantinApiClient(fetchFunction).getBridgeLog("nope"));
    expect([error.kind, error.status]).toEqual(["api", 404]);
  });

  it("builds the download link", () => {
    expect(bridgeLogDownloadUrl("press line")).toBe(
      "/api/pantins/press%20line/bridges/modbus_tcp_slave/log?download=1",
    );
  });
});
