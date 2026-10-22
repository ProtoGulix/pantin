import { readFileSync } from "node:fs";
import type { IoChannel, IoDocument, SymbolImportPreview, TagType } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import type { IoTag } from "./io-validation.ts";
import { previewSymbolImport } from "./symbol-preview.ts";

// The preview of an import against a real CODESYS V3.5 SP22 export (ADR 0064 point 13).

const REAL_EXPORT = readFileSync(
  new URL("../../../plc-symbol-formats/fixtures/codesys-3.5-sp22.xml", import.meta.url),
  "utf8",
);

const OWNER = { kind: "drive", id: "d" } as const;
const IO_TYPES = { bit: "BOOL", float: "REAL", integer: "DINT" } as const;

type Wanted = [tag: string, type: TagType, direction: IoTag["direction"], variable: string];

const WANTED: Wanted[] = [
  // Variables of the GVL that Pantin generated: they stay as they are.
  ["verin1.verin1.coil_14", "bit", "command", "verin1_verin1_coil_14"],
  ["verin1.verin1.coil_12", "bit", "command", "verin1_verin1_coil_12"],
  ["verin1.verin-max.state", "bit", "feedback", "verin1_verin_max_state"],
  ["verin1.verin-min.state", "bit", "feedback", "verin1_verin_min_state"],
  ["verin1.verin.position", "float", "feedback", "verin1_verin_position"],
  // Found by its name without underscores or case, in the program.
  ["r.position.v1", "float", "feedback", "old_name"],
  // An integer of the program, narrower than the signal and than the Modbus channel.
  ["verin1.verin1.cycles", "integer", "feedback", "udiNbCycles"],
  // Two function blocks have a Q.
  ["verin1.verin1.q", "bit", "feedback", "Q"],
  // Nothing in the file looks like it.
  ["verin1.verin1.setpoint", "float", "command", "nothing_like_it"],
];

const tags: IoTag[] = WANTED.map(([name, type, direction]) => ({
  name,
  type,
  direction,
  owner: OWNER,
}));

const document: IoDocument = {
  schema_version: 2,
  modules: [
    {
      key: "m1",
      transport: {
        kind: "modbus_tcp_slave",
        port: 1502,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
      },
      channels: WANTED.map(
        ([tag, type, , variable], address): IoChannel => ({
          tag,
          variable,
          comment: "",
          modbus: { zone: "coil", address, ioType: IO_TYPES[type] },
        }),
      ),
    },
  ],
};

function preview(): SymbolImportPreview {
  return previewSymbolImport(REAL_EXPORT, undefined, document, tags);
}

const tagsOf = (matches: SymbolImportPreview["proposals"]) => matches.map((match) => match.tag);

describe("the preview of the real export", () => {
  it("names the format, the project and the number of symbols", () => {
    const { format, project, symbolCount, warnings } = preview();
    expect(format).toBe("codesys-symbolconfiguration");
    expect(project).toEqual({
      name: "Untitled",
      deviceName: "Device",
      applicationName: "Application",
    });
    expect(symbolCount).toBe(61);
    expect(warnings).toEqual([]);
  });

  it("keeps the variables of the generated GVL as they are", () => {
    const { unchanged } = preview();
    expect(tagsOf(unchanged)).toEqual(
      expect.arrayContaining([
        "verin1.verin1.coil_14",
        "verin1.verin1.coil_12",
        "verin1.verin-max.state",
        "verin1.verin-min.state",
        "verin1.verin.position",
      ]),
    );
    const coil = unchanged.find((match) => match.tag === "verin1.verin1.coil_14");
    expect(coil).toMatchObject({
      currentVariable: "verin1_verin1_coil_14",
      proposedVariable: "verin1_verin1_coil_14",
      rule: "exact",
      compatibility: "compatible",
      warnings: [],
      symbol: { reference: "GVL.verin1_verin1_coil_14", iecType: "BOOL" },
    });
  });

  it("proposes the dotted reference of a program variable found by its normalised name", () => {
    expect(preview().proposals.find((match) => match.tag === "r.position.v1")).toMatchObject({
      currentVariable: "old_name",
      proposedVariable: "PLC_PRG.rPositionV1",
      rule: "normalised",
      compatibility: "compatible",
      symbol: { path: ["Application", "PLC_PRG", "rPositionV1"], iecType: "REAL" },
    });
  });

  it("warns about a narrower integer and about a type that differs from the Modbus channel", () => {
    const cycles = preview().unchanged.find((match) => match.tag === "verin1.verin1.cycles");
    expect(cycles?.compatibility).toBe("warning");
    expect(cycles?.warnings).toHaveLength(2);
    expect(cycles?.warnings.map((warning) => [warning.code, warning.values])).toEqual([
      ["integer_may_not_fit", { iecType: "UDINT" }],
      ["modbus_wire_type_differs", { wireType: "DINT", iecType: "UDINT" }],
    ]);
  });

  it("lists an ambiguous signal as unmatched, with its candidates", () => {
    const ambiguous = preview().unmatchedSignals.find((entry) => entry.tag === "verin1.verin1.q");
    expect(ambiguous?.candidates.map((candidate) => candidate.reference).sort()).toEqual([
      "PLC_PRG.fbVerin1.rtMarche.Q",
      "PLC_PRG.fbVerin1.tonTimeout.Q",
    ]);
  });

  it("lists a signal nothing resembles as unmatched, with no candidate", () => {
    const lost = preview().unmatchedSignals.find((entry) => entry.tag === "verin1.verin1.setpoint");
    expect(lost).toEqual({
      module: "m1",
      tag: "verin1.verin1.setpoint",
      currentVariable: "nothing_like_it",
      candidates: [],
    });
  });

  it("lists the symbols nobody uses with a reason", () => {
    const { unusedSymbols } = preview();
    const reasonOf = (reference: string) =>
      unusedSymbols.find((entry) => entry.symbol.reference === reference)?.reason;
    expect(reasonOf("PLC_PRG.xAcquit")).toBe("no_signal");
    expect(reasonOf("IoConfig_Globals.CAADEDTemp")).toBe("incompatible_type");
    expect(reasonOf("GVL.verin1_verin1_coil_14")).toBeUndefined();
    expect(unusedSymbols.find((entry) => entry.symbol.directAddress === "%IW1")).toBeDefined();
  });
});

describe("what the preview refuses", () => {
  it("names the known formats for a file none of them recognises", () => {
    expect(() => previewSymbolImport("<a/>", undefined, document, tags)).toThrow(
      /codesys-symbolconfiguration/,
    );
  });

  it("names the known formats for an unknown format id, as a 400", () => {
    const refuse = () => previewSymbolImport(REAL_EXPORT, "tia", document, tags);
    expect(refuse).toThrow(ApiError);
    expect(refuse).toThrow(expect.objectContaining({ httpStatus: 400 }));
    expect(refuse).toThrow(/codesys-symbolconfiguration/);
  });

  it("says why a file of the right format cannot be read", () => {
    const text = REAL_EXPORT.replace("<Header>", "<!DOCTYPE x><Header>");
    expect(() => previewSymbolImport(text, "codesys-symbolconfiguration", document, tags)).toThrow(
      /DOCTYPE/,
    );
  });
});

describe("the plc-cylinder tags against the real export", () => {
  // The example's valve tags are in the GVL under the same names; its sensors and position
  // are tige.* tags, while the GVL was generated for verin1.*: only the suffix rule links them.
  const cylinder: Wanted[] = [
    ["verin1.verin1.coil_14", "bit", "command", "verin1_verin1_coil_14"],
    ["tige.verin-min.state", "bit", "feedback", "tige_verin_min_state"],
    ["tige.verin-max.state", "bit", "feedback", "tige_verin_max_state"],
    ["tige.verin.position", "float", "feedback", "tige_verin_position"],
  ];
  const cylinderDocument: IoDocument = {
    ...document,
    modules: document.modules.map((module) => ({
      ...module,
      channels: cylinder.map(
        ([tag, type, , variable], address): IoChannel => ({
          tag,
          variable,
          comment: "",
          modbus: { zone: "coil", address, ioType: IO_TYPES[type] },
        }),
      ),
    })),
  };
  const cylinderTags: IoTag[] = cylinder.map(([name, type, direction]) => ({
    name,
    type,
    direction,
    owner: OWNER,
  }));

  it("links tige.verin-min.state to GVL.verin1_verin_min_state by a boundary-aware suffix", () => {
    const { proposals, unchanged, unmatchedSignals } = previewSymbolImport(
      REAL_EXPORT,
      undefined,
      cylinderDocument,
      cylinderTags,
    );
    expect(unchanged.map((match) => match.tag)).toEqual(["verin1.verin1.coil_14"]);
    expect(unmatchedSignals).toEqual([]);
    expect(
      proposals.map((match) => [
        match.tag,
        match.proposedVariable,
        match.rule,
        match.compatibility,
      ]),
    ).toEqual([
      ["tige.verin-min.state", "GVL.verin1_verin_min_state", "suffix", "compatible"],
      ["tige.verin-max.state", "GVL.verin1_verin_max_state", "suffix", "compatible"],
      ["tige.verin.position", "GVL.verin1_verin_position", "suffix", "compatible"],
    ]);
  });
});
