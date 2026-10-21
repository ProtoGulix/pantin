import { readFileSync } from "node:fs";
import { IO_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { readIoDocument, serializeIoDocument } from "./io-document-text.ts";
import { migrateIoJson, migrateIoV1ToV2 } from "./io-migrations.ts";

// io.json version 1 to 2 (ADR 0064 point 7).

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/io-v1/${name}`, import.meta.url));
const committed = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

const VERSION_1 = {
  schema_version: 1,
  modules: [
    {
      key: "m1",
      port: 1502,
      unitId: 3,
      wordOrder: "high_word_first",
      watchdogMilliseconds: 250,
      channels: [
        {
          tag: "a.b.c",
          variable: "a_b_c",
          zone: "coil",
          address: 4,
          ioType: "BOOL",
          comment: "kept",
        },
      ],
    },
  ],
};

describe("migrateIoV1ToV2", () => {
  it("moves the Modbus settings into transport and the Modbus fields into modbus", () => {
    expect(migrateIoV1ToV2(VERSION_1)).toEqual({
      schema_version: 2,
      modules: [
        {
          key: "m1",
          transport: {
            kind: "modbus_tcp_slave",
            port: 1502,
            unitId: 3,
            wordOrder: "high_word_first",
            watchdogMilliseconds: 250,
          },
          channels: [
            {
              tag: "a.b.c",
              variable: "a_b_c",
              comment: "kept",
              modbus: { zone: "coil", address: 4, ioType: "BOOL" },
            },
          ],
        },
      ],
    });
  });

  it("carries only the settings the file has, so the schema reports a missing one", () => {
    const migrated = migrateIoV1ToV2({ schema_version: 1, modules: [{ key: "m1", channels: [] }] });
    expect(migrated.modules).toEqual([
      { key: "m1", transport: { kind: "modbus_tcp_slave" }, channels: [] },
    ]);
  });

  it("leaves a shape it does not know to the schema", () => {
    expect(migrateIoV1ToV2({ schema_version: 1, modules: "nope" }).modules).toBe("nope");
    expect(migrateIoV1ToV2({ schema_version: 1, modules: [7] }).modules).toEqual([7]);
  });
});

describe("migrateIoJson", () => {
  it("runs the chain up to the current version and says where it started", () => {
    const result = migrateIoJson(VERSION_1, IO_SCHEMA_VERSION);
    expect(result.document.schema_version).toBe(2);
    expect(result.migratedFrom).toBe(1);
  });

  it("returns the file as it is when it is current, or has no usable version", () => {
    const current = { schema_version: 2, modules: [] };
    expect(migrateIoJson(current, IO_SCHEMA_VERSION)).toEqual({
      document: current,
      migratedFrom: null,
    });
    expect(migrateIoJson({ modules: [] }, IO_SCHEMA_VERSION).migratedFrom).toBeNull();
    expect(
      migrateIoJson({ schema_version: 0, modules: [] }, IO_SCHEMA_VERSION).migratedFrom,
    ).toBeNull();
  });
});

describe("readIoDocument, version 1 files", () => {
  it("reads the plc-cylinder text of 0.2 and writes the committed version 2 text, byte for byte", () => {
    const reading = readIoDocument(fixture("plc-cylinder.io.json"));
    expect(reading.kind).toBe("document");
    if (reading.kind !== "document") {
      return;
    }
    expect(reading.migratedFrom).toBe(1);
    expect(serializeIoDocument(reading.document)).toBe(committed("examples/plc-cylinder/io.json"));
  });

  it("reads the GVL equivalence fixture the same way", () => {
    const reading = readIoDocument(fixture("gvl-equivalence.io.json"));
    expect(reading.kind === "document" && serializeIoDocument(reading.document)).toBe(
      committed("packages/cli/fixtures/gvl-equivalence/io.json"),
    );
  });

  it("does not flag a version 2 file as migrated", () => {
    const reading = readIoDocument(Buffer.from(committed("examples/plc-cylinder/io.json")));
    expect(reading.kind === "document" && reading.migratedFrom).toBeUndefined();
  });

  it("reports a problem of an old file at its path in the migrated shape, and says so", () => {
    const broken = { ...VERSION_1, modules: [{ ...VERSION_1.modules[0], port: 80 }] };
    const reading = readIoDocument(Buffer.from(JSON.stringify(broken)));
    expect(reading.kind).toBe("unreadable");
    if (reading.kind !== "unreadable") {
      return;
    }
    expect(reading.problems).toMatchObject([
      { path: ["modules", 0, "transport", "port"], code: "schema_invalid" },
    ]);
    expect(reading.problems[0]?.message).toContain("migrated from version 1");
  });

  it("refuses a version above the current one by name", () => {
    const reading = readIoDocument(Buffer.from('{"schema_version": 3, "modules": []}'));
    expect(reading.kind === "unreadable" && reading.problems).toMatchObject([
      { path: [], code: "newer_schema_version" },
    ]);
  });
});
