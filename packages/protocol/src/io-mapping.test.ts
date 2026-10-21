import { TRANSPORT_PROBLEM_CODES } from "@pantin/transport-types/schemas";
import { describe, expect, it } from "vitest";
import { IO_PROBLEM_CODES, IoMappingResponseSchema } from "./io-mapping.ts";

describe("IoMappingResponseSchema", () => {
  it("accepts the answer for a missing mapping", () => {
    const missing = {
      status: "missing",
      mappingId: null,
      modules: [],
      problems: [],
      unmappedTags: [
        { name: "a.b.c", type: "bit", direction: "command", owner: { kind: "drive", id: "d" } },
      ],
    };
    expect(IoMappingResponseSchema.parse(missing)).toEqual(missing);
  });

  it("refuses a status or a problem code it does not know", () => {
    const base = { mappingId: null, modules: [], unmappedTags: [] };
    expect(IoMappingResponseSchema.safeParse({ ...base, status: "ok", problems: [] }).success).toBe(
      false,
    );
    const problem = { path: [], code: "nope", message: "" };
    expect(
      IoMappingResponseSchema.safeParse({ ...base, status: "invalid", problems: [problem] })
        .success,
    ).toBe(false);
  });

  it("refuses the removed codes of the CSV and a problem with a file or line", () => {
    const base = { status: "invalid", mappingId: null, modules: [], unmappedTags: [] };
    const csvCode = { path: [], code: "bad_header", message: "" };
    const legacyFiles = { path: [], code: "legacy_io_files", message: "" };
    const withLine = { file: "io.csv", line: 3, column: 1, code: "unknown_tag", message: "" };
    for (const problem of [csvCode, legacyFiles, withLine]) {
      expect(IoMappingResponseSchema.safeParse({ ...base, problems: [problem] }).success).toBe(
        false,
      );
    }
  });
});

describe("IoMappingResponseSchema, version 2 (ADR 0064)", () => {
  const base = { mappingId: null, modules: [], unmappedTags: [] };
  const withCode = (code: string) => ({
    ...base,
    status: "invalid",
    problems: [{ path: [], code, message: "" }],
  });

  it.each([
    "newer_schema_version",
    "command_mapped_twice",
    "unsupported_signal",
    "listen_port_used_twice",
    "zone_direction_mismatch",
    "address_overlap",
  ])("accepts the problem code %s: the common codes and those of the transports", (code) => {
    expect(IoMappingResponseSchema.safeParse(withCode(code)).success).toBe(true);
  });

  it("lists every code of the transports among the codes it accepts", () => {
    for (const code of TRANSPORT_PROBLEM_CODES) {
      expect(IO_PROBLEM_CODES).toContain(code);
    }
  });

  it("describes a module by its transport, and refuses the version 1 top level settings", () => {
    const channel = {
      tag: "a.b.c",
      variable: "a_b_c",
      comment: "",
      modbus: { zone: "coil", address: 0, ioType: "BOOL" },
      tagType: "bit",
      direction: "command",
      owner: null,
    };
    const transport = { kind: "modbus_tcp_slave", port: 1502 };
    const valid = { ...base, status: "valid", problems: [] };
    const module = { key: "m1", transport, channels: [channel] };
    expect(IoMappingResponseSchema.safeParse({ ...valid, modules: [module] }).success).toBe(true);
    const flat = { key: "m1", port: 1502, channels: [] };
    expect(IoMappingResponseSchema.safeParse({ ...valid, modules: [flat] }).success).toBe(false);
  });
});
