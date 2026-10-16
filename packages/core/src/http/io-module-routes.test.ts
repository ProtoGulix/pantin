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
        port: 1502,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
        channels: [],
      },
    ]);
    expect(call.answer.unmappedTags.length).toBeGreaterThan(0);
  });

  it("takes the smallest free key and port, and the settings it is given", async () => {
    await io.addModule();
    await io.addModule({ port: 1600, unitId: 7, wordOrder: "high_word_first" });
    await io.call("DELETE", "/modules/m1");
    const call = await io.addModule({ watchdogMilliseconds: 250 });
    expect(call.answer.modules.map((module) => [module.key, module.port])).toEqual([
      ["m2", 1600],
      ["m1", 1502],
    ]);
    expect(call.answer.modules[1]?.watchdogMilliseconds).toBe(250);
    expect(call.answer.modules[0]).toMatchObject({ unitId: 7, wordOrder: "high_word_first" });
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
    expect((await io.addModule({ unitId: 0 })).status).toBe(400);
  });
});

describe("PATCH .../io/modules/:moduleKey", () => {
  it("edits the settings and renames the module", async () => {
    await io.addModule();
    await io.addModule();
    const call = await io.call("PATCH", "/modules/m2", {
      key: "line",
      port: 1700,
      unitId: 3,
      wordOrder: "high_word_first",
      watchdogMilliseconds: 5000,
    });
    expect(call.status).toBe(200);
    expect(call.answer.modules[1]).toMatchObject({
      key: "line",
      port: 1700,
      unitId: 3,
      wordOrder: "high_word_first",
      watchdogMilliseconds: 5000,
    });
  });

  it("leaves the settings that are not sent as they are, and its channels in place", async () => {
    await io.addModule();
    await io.mapTags([COIL]);
    const call = await io.call("PATCH", "/modules/m1", { unitId: 9, key: "first" });
    expect(call.answer.modules[0]).toMatchObject({ key: "first", port: 1502, unitId: 9 });
    expect(channelOf(call, COIL)).toBeDefined();
  });

  it("accepts the key and port a module already has", async () => {
    await io.addModule();
    const call = await io.call("PATCH", "/modules/m1", { key: "m1", port: 1502 });
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
    expect((await io.call("PATCH", "/modules/m1", { port: 1503 })).status).toBe(409);
  });

  it("answers 400 for an invalid body", async () => {
    await io.addModule();
    expect((await io.call("PATCH", "/modules/m1", { port: 99999 })).status).toBe(400);
    expect((await io.call("PATCH", "/modules/m1", { key: "Bad Key" })).status).toBe(400);
    expect((await io.call("PATCH", "/modules/m1", { channels: [] })).status).toBe(400);
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
