import { createHash } from "node:crypto";
import { type IoDocument, IoDocumentSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  canonicalIoDocument,
  ioTextOf,
  mappingIdOf,
  readIoDocument,
  serializeIoDocument,
} from "./io-document-text.ts";

// The canonical text of io.json (ADR 0049 points 1 and 7).

const channel = (
  tag: string,
  zone: IoDocument["modules"][number]["channels"][number]["zone"],
  address: number,
) => ({
  tag,
  variable: tag.replaceAll(".", "_"),
  zone,
  address,
  ioType: zone === "coil" || zone === "discrete_input" ? ("BOOL" as const) : ("REAL" as const),
  comment: "",
});

const settings = { unitId: 1, wordOrder: "low_word_first", watchdogMilliseconds: 1000 } as const;

const EMPTY_MODULE = { key: "m0", port: 1503, ...settings, channels: [] };

const SHUFFLED: IoDocument = {
  schema_version: 1,
  modules: [
    {
      key: "m1",
      port: 1502,
      ...settings,
      channels: [
        channel("b.in.state", "input_register", 0),
        channel("z.c.coil", "coil", 3),
        channel("b.c.coil", "coil", 3),
        channel("a.c.coil", "coil", 1),
        channel("a.d.state", "discrete_input", 0),
        channel("a.h.setpoint", "holding_register", 2),
      ],
    },
    EMPTY_MODULE,
  ],
};

const encode = (text: string) => new TextEncoder().encode(text);

describe("serializeIoDocument", () => {
  it("sorts channels by zone, then address, then tag, and keeps the modules' order", () => {
    const sorted = canonicalIoDocument(SHUFFLED);
    expect(sorted.modules.map((module) => module.key)).toEqual(["m1", "m0"]);
    expect(sorted.modules[0]?.channels.map((c) => c.tag)).toEqual([
      "a.c.coil",
      "b.c.coil",
      "z.c.coil",
      "a.d.state",
      "a.h.setpoint",
      "b.in.state",
    ]);
  });
});

describe("serializeIoDocument text", () => {
  it("uses 2-space indentation, a final newline and the key order of the ADR", () => {
    const text = serializeIoDocument({
      schema_version: 1,
      modules: [EMPTY_MODULE],
    });
    expect(text).toBe(`{
  "schema_version": 1,
  "modules": [
    {
      "key": "m0",
      "port": 1503,
      "unitId": 1,
      "wordOrder": "low_word_first",
      "watchdogMilliseconds": 1000,
      "channels": []
    }
  ]
}
`);
  });

  it("does not depend on the order of the keys of the objects it is given", () => {
    const reversed = JSON.parse(
      JSON.stringify(SHUFFLED, [
        "schema_version",
        "modules",
        "channels",
        "comment",
        "ioType",
        "address",
        "zone",
        "variable",
        "tag",
        "watchdogMilliseconds",
        "wordOrder",
        "unitId",
        "port",
        "key",
      ]),
    );
    expect(serializeIoDocument(IoDocumentSchema.parse(reversed))).toBe(
      serializeIoDocument(SHUFFLED),
    );
  });

  it("is a fixed point: reading the text back and writing it again gives the same text", () => {
    const text = serializeIoDocument(SHUFFLED);
    const reading = readIoDocument(encode(text));
    expect(ioTextOf(reading)).toBe(text);
  });
});

describe("mappingIdOf", () => {
  it("is the SHA-256 of the canonical text, equal for any order of the channels", () => {
    const text = serializeIoDocument(SHUFFLED);
    const expected = createHash("sha256").update(text).digest("hex");
    expect(mappingIdOf({ kind: "document", document: SHUFFLED })).toBe(expected);
    const reordered = {
      ...SHUFFLED,
      modules: SHUFFLED.modules.map((m) => ({ ...m, channels: m.channels.toReversed() })),
    };
    expect(mappingIdOf({ kind: "document", document: reordered })).toBe(expected);
  });

  it("changes with any field and is null when there is no usable mapping", () => {
    const edited = canonicalIoDocument(SHUFFLED);
    const first = edited.modules[0]?.channels[0];
    if (first === undefined) {
      throw new Error("The fixture has channels.");
    }
    first.comment = "note";
    expect(mappingIdOf({ kind: "document", document: edited })).not.toBe(
      mappingIdOf({ kind: "document", document: SHUFFLED }),
    );
    expect(mappingIdOf({ kind: "missing" })).toBeNull();
    expect(mappingIdOf({ kind: "unreadable", problems: [] })).toBeNull();
  });
});

describe("readIoDocument", () => {
  it("is missing for no bytes", () => {
    expect(readIoDocument(undefined)).toEqual({ kind: "missing" });
  });

  it("reads a hand formatted file into the canonical order", () => {
    const reading = readIoDocument(encode(JSON.stringify(SHUFFLED)));
    expect(reading.kind === "document" && reading.document.modules[0]?.channels[0]?.tag).toBe(
      "a.c.coil",
    );
  });

  it("skips a byte order mark", () => {
    const bytes = encode(`﻿${serializeIoDocument(SHUFFLED)}`);
    expect(readIoDocument(bytes).kind).toBe("document");
  });

  it.each([
    ["invalid_encoding", Uint8Array.of(0x7b, 0xff, 0x7d)],
    ["invalid_json", encode("{nope")],
    ["schema_invalid", encode("{}")],
    ["file_too_large", new Uint8Array(1024 * 1024 + 1)],
  ])("is unreadable with %s", (code, bytes) => {
    const reading = readIoDocument(bytes);
    expect(
      reading.kind === "unreadable" && reading.problems.map((problem) => problem.code),
    ).toContain(code);
  });

  it("gives the Zod path of each schema issue", () => {
    const bad = {
      schema_version: 1,
      modules: [{ key: "m1", port: 80, channels: [{ tag: "a.b.c" }] }],
    };
    const reading = readIoDocument(encode(JSON.stringify(bad)));
    const paths = reading.kind === "unreadable" ? reading.problems.map((p) => p.path) : [];
    expect(paths).toContainEqual(["modules", 0, "port"]);
    expect(paths).toContainEqual(["modules", 0, "channels", 0, "variable"]);
  });
});
