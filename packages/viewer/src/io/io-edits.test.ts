import { describe, expect, it } from "vitest";
import { parseChannelEdit, parseModuleEdit } from "./io-edits.ts";

const request = (value: object) => ({ kind: "request", request: value });

describe("parseModuleEdit", () => {
  it("parses whole numbers and keeps the other settings untouched", () => {
    expect(parseModuleEdit("port", "1503")).toEqual(request({ port: 1503 }));
    expect(parseModuleEdit("watchdogMilliseconds", " 500 ")).toEqual(
      request({ watchdogMilliseconds: 500 }),
    );
  });

  it("trims a key and accepts only the two word orders", () => {
    expect(parseModuleEdit("key", " plc ")).toEqual(request({ key: "plc" }));
    expect(parseModuleEdit("wordOrder", "high_word_first")).toEqual(
      request({ wordOrder: "high_word_first" }),
    );
    expect(parseModuleEdit("wordOrder", "other")).toEqual({ kind: "ignored" });
  });

  it("names the field when a number is empty or not a whole number", () => {
    for (const text of ["", "  ", "abc", "1.5", "-2"]) {
      expect(parseModuleEdit("unitId", text)).toEqual({ kind: "invalidNumber", field: "unitId" });
    }
  });

  it("ignores a field it does not know", () => {
    expect(parseModuleEdit("channels", "x")).toEqual({ kind: "ignored" });
  });
});

describe("parseChannelEdit", () => {
  it("edits variable, address and comment", () => {
    expect(parseChannelEdit("variable", " valve ")).toEqual(request({ variable: "valve" }));
    expect(parseChannelEdit("address", "12")).toEqual(request({ address: 12 }));
    expect(parseChannelEdit("comment", " note ")).toEqual(request({ comment: " note " }));
    expect(parseChannelEdit("address", "x")).toEqual({ kind: "invalidNumber", field: "address" });
  });

  it("does not edit what the core derives", () => {
    expect(parseChannelEdit("zone", "coil")).toEqual({ kind: "ignored" });
    expect(parseChannelEdit("ioType", "REAL")).toEqual({ kind: "ignored" });
  });
});
