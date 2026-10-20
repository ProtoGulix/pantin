import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { renderIoCsv } from "./io-csv.ts";

type Module = IoMappingResponse["modules"][number];
type Channel = Module["channels"][number];

const HEADER = "module,port,unitId,tag,variable,zone,address,ioType,direction,comment";

function channel(tag: string, comment = ""): Channel {
  return {
    tag,
    variable: tag.replaceAll(".", "_"),
    zone: "coil",
    address: 3,
    ioType: "BOOL",
    comment,
    tagType: "bit",
    direction: "command",
    owner: null,
  };
}

function moduleOf(key: string, channels: Channel[]): Module {
  return {
    key,
    port: 1502,
    unitId: 2,
    wordOrder: "low_word_first",
    watchdogMilliseconds: 1000,
    channels,
  };
}

const rowsOf = (text: string) => text.split("\r\n");

describe("renderIoCsv", () => {
  it("starts with a byte order mark and the header, and ends with a line break", () => {
    const text = renderIoCsv([moduleOf("m1", [channel("a.b.c")])]);
    expect(text.startsWith(`﻿${HEADER}\r\n`)).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("writes one row per channel, modules in the given order", () => {
    const rows = rowsOf(
      renderIoCsv([moduleOf("m2", [channel("a.b.c")]), moduleOf("m1", [channel("d.e.f")])]),
    );
    expect(rows.slice(1, 3)).toEqual([
      "m2,1502,2,a.b.c,a_b_c,coil,3,BOOL,command,",
      "m1,1502,2,d.e.f,d_e_f,coil,3,BOOL,command,",
    ]);
  });

  it("is the header alone for an empty mapping", () => {
    expect(renderIoCsv([])).toBe(`﻿${HEADER}\r\n`);
    expect(renderIoCsv([moduleOf("m1", [])])).toBe(`﻿${HEADER}\r\n`);
  });

  it("keeps accents and quotes commas, quotes and line breaks as RFC 4180 says", () => {
    const text = renderIoCsv([moduleOf("m1", [channel("a.b.c", 'Vérin "sortie", côté\ngauche')])]);
    expect(text).toContain('"Vérin ""sortie"", côté\ngauche"');
  });

  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "writes a comment starting with %j with a leading apostrophe",
    (start) => {
      const text = renderIoCsv([moduleOf("m1", [channel("a.b.c", `${start}B12`)])]);
      expect(text).toContain(`'${start}B12`);
      expect(text).not.toContain(`,${start}B12`);
    },
  );

  it("quotes a guarded comment that also needs quoting", () => {
    const text = renderIoCsv([moduleOf("m1", [channel("a.b.c", "=a,b")])]);
    expect(rowsOf(text)[1]?.endsWith(`,"'=a,b"`)).toBe(true);
  });

  it("leaves a dash in the middle of a comment untouched", () => {
    const text = renderIoCsv([moduleOf("m1", [channel("a.b.c", "relay -B12 + A1")])]);
    expect(rowsOf(text)[1]?.endsWith(",relay -B12 + A1")).toBe(true);
  });

  it("never prefixes the other columns", () => {
    const odd: Channel = { ...channel("-a.b", "x"), variable: "+v" };
    const text = renderIoCsv([moduleOf("m1", [odd])]);
    expect(rowsOf(text)[1]).toBe("m1,1502,2,-a.b,+v,coil,3,BOOL,command,x");
  });
});
