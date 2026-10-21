import { describe, expect, it } from "vitest";
import { COIL, channelOf, useIoAxis } from "../test-support/io-edits.ts";

// POST, PATCH and DELETE .../io/modules (ADR 0049 point 4): every answer is
// the whole mapping.

const io = useIoAxis();

describe("POST .../io/modules", () => {
  it("creates the mapping with m1, port 1502 and the defaults, and answers 201", async () => {
    const call = await io.addModule();
    expect(call.status).toBe(201);
    expect(call.answer.status).toBe("valid");
    expect(call.answer.mappingId).toMatch(/^[0-9a-f]{64}$/);
    expect(call.answer.modules).toEqual([
      {
        key: "m1",
        transport: {
          kind: "modbus_tcp_slave",
          port: 1502,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 1000,
        },
        channels: [],
      },
    ]);
    expect(call.answer.unmappedTags.length).toBeGreaterThan(0);
  });
});

describe("POST .../io/modules settings", () => {
  it("takes the smallest free key and port, and the settings it is given", async () => {
    await io.addModule();
    await io.addModule({ port: 1600, unitId: 7, wordOrder: "high_word_first" });
    await io.call("DELETE", "/modules/m1");
    const call = await io.addModule({ watchdogMilliseconds: 250 });
    expect(call.answer.modules.map((module) => [module.key, module.transport.port])).toEqual([
      ["m2", 1600],
      ["m1", 1502],
    ]);
    expect(call.answer.modules[1]?.transport).toMatchObject({ watchdogMilliseconds: 250 });
    expect(call.answer.modules[0]?.transport).toMatchObject({
      unitId: 7,
      wordOrder: "high_word_first",
    });
  });

  it("answers 409 for a port another module uses", async () => {
    await io.addModule();
    const taken = await io.addModule({ port: 1502 });
    expect(taken.status).toBe(409);
    expect(taken.text).toContain("1502");
  });

  it("answers 400 for an invalid body", async () => {
    expect((await io.addModule({ port: 80 })).status).toBe(400);
    expect((await io.addModule({ key: "m9" })).status).toBe(400);
    expect((await io.call("POST", "/modules", {})).status).toBe(400);
    expect(
      (await io.call("POST", "/modules", { transport: { kind: "carrier_pigeon" } })).status,
    ).toBe(400);
    expect((await io.addModule({ unitId: 0 })).status).toBe(400);
  });
});

describe("PATCH .../io/modules/:moduleKey", () => {
  it("edits the settings and renames the module", async () => {
    await io.addModule();
    await io.addModule();
    const call = await io.call("PATCH", "/modules/m2", {
      key: "line",
      transport: {
        kind: "modbus_tcp_slave",
        port: 1700,
        unitId: 3,
        wordOrder: "high_word_first",
        watchdogMilliseconds: 5000,
      },
    });
    expect(call.status).toBe(200);
    expect(call.answer.modules[1]).toMatchObject({
      key: "line",
      transport: {
        port: 1700,
        unitId: 3,
        wordOrder: "high_word_first",
        watchdogMilliseconds: 5000,
      },
    });
  });
});

describe("PATCH .../io/modules/:moduleKey refusals and keeps", () => {
  it("leaves the settings that are not sent as they are, and its channels in place", async () => {
    await io.addModule();
    await io.mapTags([COIL]);
    const call = await io.call("PATCH", "/modules/m1", {
      key: "first",
      transport: { kind: "modbus_tcp_slave", unitId: 9 },
    });
    expect(call.answer.modules[0]).toMatchObject({
      key: "first",
      transport: { port: 1502, unitId: 9 },
    });
    expect(channelOf(call, COIL)).toBeDefined();
  });

  it("accepts the key and port a module already has", async () => {
    await io.addModule();
    const call = await io.call("PATCH", "/modules/m1", {
      key: "m1",
      transport: { kind: "modbus_tcp_slave", port: 1502 },
    });
    expect(call.status).toBe(200);
  });

  it("answers 404 for an unknown module", async () => {
    await io.addModule();
    expect((await io.call("PATCH", "/modules/ghost", {})).status).toBe(404);
  });

  it("answers 409 for a key or a port another module uses", async () => {
    await io.addModule();
    await io.addModule();
    expect((await io.call("PATCH", "/modules/m1", { key: "m2" })).status).toBe(409);
    const samePort = { transport: { kind: "modbus_tcp_slave", port: 1503 } };
    expect((await io.call("PATCH", "/modules/m1", samePort)).status).toBe(409);
  });

  it("answers 400 for an invalid body", async () => {
    await io.addModule();
    const hugePort = { transport: { kind: "modbus_tcp_slave", port: 99999 } };
    expect((await io.call("PATCH", "/modules/m1", hugePort)).status).toBe(400);
    expect((await io.call("PATCH", "/modules/m1", { key: "Bad Key" })).status).toBe(400);
    expect((await io.call("PATCH", "/modules/m1", { channels: [] })).status).toBe(400);
  });
});

describe("PATCH .../io/modules/:moduleKey transport kind", () => {
  it("answers 400 for another kind than the module's: a module keeps its transport", async () => {
    await io.addModule();
    const call = await io.call("PATCH", "/modules/m1", { transport: { kind: "carrier_pigeon" } });
    expect(call.status).toBe(400);
  });
});

describe("DELETE .../io/modules/:moduleKey", () => {
  it("deletes a module with its channels, and answers 404 for an unknown one", async () => {
    await io.addModule();
    await io.addModule();
    await io.mapTags([COIL], "m2");
    const call = await io.call("DELETE", "/modules/m2");
    expect(call.status).toBe(200);
    expect(call.answer.modules.map((module) => module.key)).toEqual(["m1"]);
    expect(call.answer.unmappedTags.map((tag) => tag.name)).toContain(COIL);
    expect((await io.call("DELETE", "/modules/m2")).status).toBe(404);
  });
});
