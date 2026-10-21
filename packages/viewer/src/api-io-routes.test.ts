import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { captureError, fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// I/O mapping routes (ADR 0049 point 4).

const mapping = {
  status: "valid",
  mappingId: "abc",
  modules: [
    {
      key: "m1",
      transport: {
        kind: "modbus_tcp_slave" as const,
        port: 1502,
        unitId: 1,
        wordOrder: "low_word_first" as const,
        watchdogMilliseconds: 1000,
      },
      channels: [
        {
          tag: "main.valve.extend",
          variable: "valve_extend",
          comment: "",
          modbus: { zone: "coil", address: 0, ioType: "BOOL" },
          tagType: "bit",
          direction: "command",
          owner: { kind: "drive", id: "valve" },
        },
      ],
    },
  ],
  problems: [],
  unmappedTags: [],
};

async function sent(call: (client: ReturnType<typeof createPantinApiClient>) => Promise<unknown>) {
  const { fetchFunction, requests } = fakeFetch(jsonResponse(mapping));
  const result = await call(createPantinApiClient(fetchFunction));
  return {
    result,
    method: requests[0]?.init?.method,
    url: requests[0]?.url,
    body: requests[0]?.init?.body,
  };
}

describe("PantinApiClient I/O mapping", () => {
  it("reads the mapping with GET", async () => {
    const { result, method, url } = await sent((client) => client.getIoMapping("press"));
    expect([result, method, url]).toEqual([mapping, "GET", "/api/pantins/press/io"]);
  });

  it("adds a module with POST", async () => {
    const { method, url, body } = await sent((client) =>
      client.createIoModule("press", { transport: { kind: "modbus_tcp_slave", port: 1503 } }),
    );
    expect([method, url, body]).toEqual([
      "POST",
      "/api/pantins/press/io/modules",
      JSON.stringify({ transport: { kind: "modbus_tcp_slave", port: 1503 } }),
    ]);
  });

  it("edits and removes a module by key", async () => {
    const edit = await sent((client) => client.updateIoModule("press", "m1", { key: "plc" }));
    const removal = await sent((client) => client.deleteIoModule("press", "m1"));
    expect([edit.method, edit.url]).toEqual(["PATCH", "/api/pantins/press/io/modules/m1"]);
    expect([removal.method, removal.url]).toEqual(["DELETE", "/api/pantins/press/io/modules/m1"]);
  });

  it("maps tags into a module with POST", async () => {
    const { method, url, body } = await sent((client) =>
      client.createIoChannels("press", "m1", { tags: ["main.valve.extend"] }),
    );
    expect([method, url, body]).toEqual([
      "POST",
      "/api/pantins/press/io/modules/m1/channels",
      JSON.stringify({ tags: ["main.valve.extend"] }),
    ]);
  });
});

describe("PantinApiClient I/O channels", () => {
  it("edits and unmaps a channel by tag", async () => {
    const edit = await sent((client) =>
      client.updateIoChannel("press", "m1", "main.valve.extend", { tag: "main.valve.extend" }),
    );
    const removal = await sent((client) =>
      client.deleteIoChannel("press", "m1", "main.valve.extend"),
    );
    expect([edit.method, edit.url]).toEqual([
      "PATCH",
      "/api/pantins/press/io/modules/m1/channels/main.valve.extend",
    ]);
    expect(removal.method).toBe("DELETE");
  });

  it("refuses an invalid body before sending anything", async () => {
    const { fetchFunction, requests } = fakeFetch(jsonResponse(mapping));
    const error = await captureError(
      createPantinApiClient(fetchFunction).createIoChannels("press", "m1", { tags: [] }),
    );
    expect([error.kind, requests.length]).toEqual(["invalid_input", 0]);
  });

  it("refuses an answer that does not match the protocol", async () => {
    const { fetchFunction } = fakeFetch(jsonResponse({ status: "valid" }));
    const error = await captureError(createPantinApiClient(fetchFunction).getIoMapping("press"));
    expect(error.kind).toBe("invalid_response");
  });
});

describe("PantinApiClient CSV download", () => {
  it("reads the CSV with its byte order mark, named after the Pantin", async () => {
    const bytes = new TextEncoder().encode("\uFEFFmodule,port\r\n");
    const { fetchFunction, requests } = fakeFetch(new Response(bytes));
    const file = await createPantinApiClient(fetchFunction).fetchIoCsv("press");
    expect([file, requests[0]?.url, requests[0]?.init?.method]).toEqual([
      { fileName: "press-io.csv", text: "\uFEFFmodule,port\r\n" },
      "/api/pantins/press/io/csv",
      "GET",
    ]);
  });

  it("raises the core's 409 with its problems", async () => {
    const { fetchFunction } = fakeFetch(
      jsonResponse({ error: { code: "conflict", message: "The mapping is invalid" } }, 409),
    );
    const error = await captureError(createPantinApiClient(fetchFunction).fetchIoCsv("press"));
    expect([error.kind, error.code, error.status]).toEqual(["api", "conflict", 409]);
  });
});

describe("PantinApiClient GVL download", () => {
  it("reads the GVL as text with GET, named after the Pantin", async () => {
    const { fetchFunction, requests } = fakeFetch(new Response("VAR_GLOBAL\nEND_VAR\n"));
    const file = await createPantinApiClient(fetchFunction).fetchIoGvl("press");
    expect([file, requests[0]?.url, requests[0]?.init?.method]).toEqual([
      { fileName: "press.gvl", text: "VAR_GLOBAL\nEND_VAR\n" },
      "/api/pantins/press/io/gvl",
      "GET",
    ]);
  });

  it("raises the core's 409 with its problems", async () => {
    const { fetchFunction } = fakeFetch(
      jsonResponse(
        { error: { code: "conflict", message: "The mapping is invalid: overlap" } },
        409,
      ),
    );
    const error = await captureError(createPantinApiClient(fetchFunction).fetchIoGvl("press"));
    expect([error.kind, error.code, error.status, error.message]).toEqual([
      "api",
      "conflict",
      409,
      "The mapping is invalid: overlap",
    ]);
  });
});
