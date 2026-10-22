import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectFormat, findFormatById, PLC_SYMBOL_FORMAT_IDS } from "../formats.ts";
import { type PlcSymbol, type PlcSymbolList, PlcSymbolListSchema } from "../model.ts";
import { CODESYS_SYMBOLCONFIGURATION_FORMAT } from "./format.ts";

const read = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8");

function listOf(text: string): PlcSymbolList {
  const result = CODESYS_SYMBOLCONFIGURATION_FORMAT.parse(text);
  if (!result.ok) {
    throw new Error(result.problems.map((problem) => problem.message).join("; "));
  }
  // The format's own output obeys the model's schema.
  return PlcSymbolListSchema.parse(result.list);
}

const byPath = (list: PlcSymbolList, path: string): PlcSymbol | undefined =>
  list.symbols.find((symbol) => symbol.path.join(".") === path);

describe("the real CODESYS V3.5 SP22 export", () => {
  const list = listOf(read("codesys-3.5-sp22.xml"));

  it("is recognised by its root element and namespace, and read without a warning", () => {
    expect(detectFormat(read("codesys-3.5-sp22.xml"))?.id).toBe("codesys-symbolconfiguration");
    expect(list.project).toEqual({
      name: "Untitled",
      deviceName: "Device",
      applicationName: "Application",
    });
    expect(list.warnings).toEqual([]);
  });

  it("lists a GVL variable with its type, access and trimmed comment", () => {
    expect(byPath(list, "Application.GVL.verin1_verin1_coil_12")).toEqual({
      path: ["Application", "GVL", "verin1_verin1_coil_12"],
      iecType: "BOOL",
      access: "read_write",
      comment: "m1 coil 1, verin1.verin1.coil_12",
    });
    expect(byPath(list, "Application.GVL.verin1_verin_position")?.iecType).toBe("REAL");
  });

  it("keeps the newlines of a multi-line comment and trims its ends", () => {
    const text = `<Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"><TypeList><TypeSimple name="T_BOOL" iecname="BOOL"/></TypeList><NodeList><Node name="A"><Node name="v" type="T_BOOL"><Comment> first line\n second line </Comment></Node></Node></NodeList></Symbolconfiguration>`;
    expect(listOf(text).symbols[0]?.comment).toBe("first line\n second line");
  });

  it("opens a function block instance into one symbol per member, inherited ones included", () => {
    expect(byPath(list, "Application.PLC_PRG.fbVerin1.xBobine14")).toMatchObject({
      iecType: "BOOL",
      access: "read_write",
    });
    expect(byPath(list, "Application.PLC_PRG.fbVerin1.iEtat")?.iecType).toBe("INT");
    expect(byPath(list, "Application.PLC_PRG.fbVerin1.udiNbCycles")?.iecType).toBe("UDINT");
    // A function block inside the function block, one level deeper.
    expect(byPath(list, "Application.PLC_PRG.fbVerin1.rtMarche.Q")?.iecType).toBe("BOOL");
    expect(byPath(list, "Application.PLC_PRG.fbVerin1.tonTimeout.ET")?.iecType).toBe("TIME");
  });

  it("lists the container itself nowhere: only its members are symbols", () => {
    expect(byPath(list, "Application.PLC_PRG.fbVerin1")).toBeUndefined();
    expect(byPath(list, "Application.Constants.CompilerVersion")).toBeUndefined();
  });

  it("opens a structure, and a read-only node makes its members read-only", () => {
    expect(byPath(list, "Application.Constants.CompilerVersion.uiMajor")).toMatchObject({
      iecType: "UINT",
      access: "read",
      comment: null,
    });
  });

  it("lists plain program variables", () => {
    expect(byPath(list, "Application.PLC_PRG.xStartCycle")).toMatchObject({
      iecType: "BOOL",
      comment: "TRUE = va-et-vient, FALSE = arrêt en fin de cycle",
    });
    expect(byPath(list, "Application.PLC_PRG.rPositionV1")?.iecType).toBe("REAL");
  });
});

describe("the real export, enumerations, pointers and addresses", () => {
  const list = listOf(read("codesys-3.5-sp22.xml"));

  it("gives an enumeration's name as the type of its symbol, not its values as members", () => {
    expect(byPath(list, "Application.IoConfig_Globals.Ethernet.eState")?.iecType).toBe(
      "EthernetState",
    );
    expect(list.symbols.some((symbol) => symbol.path.includes("NOT_CONFIGURED"))).toBe(false);
    expect(
      byPath(list, "Application.IoConfig_Globals.Modbus_TCP_Server.byModbusError")?.iecType,
    ).toBe("MB_ErrorCodes");
  });

  it("never opens a pointer, a type reference or an array", () => {
    expect(byPath(list, "Application.IoConfig_Globals.CAADEDTemp")?.iecType).toBe(
      "POINTER TO BYTE",
    );
    expect(byPath(list, "Application.IoConfig_Globals.DeviceNodes")?.iecType).toBe(
      "ARRAY [0..3] OF DED.INode",
    );
    expect(
      byPath(list, "Application.IoConfig_Globals.Modbus_TCP_Server.ComSettings.ipAddress")?.iecType,
    ).toBe("ARRAY [0..3] OF BYTE");
  });

  it("keeps the direct address of a mapped I/O variable, display only", () => {
    expect(byPath(list, "Application.IoConfig_Globals_Mapping.position_word_0")).toMatchObject({
      iecType: "WORD",
      access: "read",
      directAddress: "%IW1",
      comment: "Modbus_TCP_Server : 0x0000",
    });
  });

  it("reads inherited members of a derived function block without walking its base", () => {
    const own = list.symbols.filter((symbol) =>
      symbol.path.join(".").startsWith("Application.IoConfig_Globals.Modbus_TCP_Server."),
    );
    const names = own.map((symbol) => symbol.path[3]);
    expect(names.filter((name) => name === "xInitDone")).toHaveLength(1);
  });
});

describe("the synthetic file", () => {
  const list = listOf(read("synthetic.xml"));

  it("maps Read to read and a variable without access to unknown, without a warning", () => {
    expect(byPath(list, "Application.GVL.read_only_flag")).toMatchObject({
      access: "read",
      comment: "set by the program, never written from outside",
    });
    expect(byPath(list, "Application.GVL.no_access")?.access).toBe("unknown");
  });

  it("reads Write and an unseen spelling as unknown, with one warning each", () => {
    expect(byPath(list, "Application.GVL.write_only_count")?.access).toBe("unknown");
    expect(byPath(list, "Application.GVL.odd_access")?.access).toBe("unknown");
    expect(list.warnings.filter((warning) => warning.values["access"] === "Write")).toHaveLength(1);
    expect(list.warnings.filter((warning) => warning.values["access"] === "ReadOnly")).toHaveLength(
      1,
    );
  });

  it("lists an array and a string as symbols of their type", () => {
    expect(byPath(list, "Application.GVL.samples")?.iecType).toBe("ARRAY [0..10] OF INT");
    expect(byPath(list, "Application.GVL.label")?.iecType).toBe("STRING");
  });

  it("opens a structure, with a member's own access and comment", () => {
    expect(byPath(list, "Application.GVL.origin.X")?.access).toBe("read_write");
    expect(byPath(list, "Application.GVL.origin.Y")).toMatchObject({
      access: "read",
      comment: "read-only member",
    });
    expect(byPath(list, "Application.GVL.frozen_origin.X")?.access).toBe("read");
  });

  it("lists a variable of an undefined type with that name, and warns", () => {
    expect(byPath(list, "Application.GVL.lost")?.iecType).toBe("T_Vanished");
    expect(list.warnings).toContainEqual(
      expect.objectContaining({
        code: "type_undefined",
        values: { path: "Application.GVL.lost", typeName: "T_Vanished" },
      }),
    );
  });

  it("opens 8 levels of nesting and lists the ninth as one symbol, with a warning", () => {
    const nexts = (count: number) => ["Application", "GVL", "deep", ...Array(count).fill("next")];
    const flags = list.symbols.filter((symbol) => symbol.path.at(-1) === "flag");
    expect(flags).toHaveLength(8);
    const unopened = list.symbols.find((symbol) => symbol.iecType === "Level9");
    expect(unopened?.path).toEqual(nexts(8));
    expect(list.symbols.some((symbol) => symbol.iecType === "Level10")).toBe(false);
    expect(list.warnings.some((warning) => warning.code === "nesting_too_deep")).toBe(true);
  });
});

describe("an alias type", () => {
  it("is listed under its own name, with the type it stands for noted", () => {
    const text = `<Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"><TypeList><TypeSimple name="T_XWORD" typeclass="LWord" iecname="XWORD" aliasedtype="T_LWORD" aliasediecname="LWORD"/></TypeList><NodeList><Node name="A"><Node name="v" type="T_XWORD" access="ReadWrite"/></Node></NodeList></Symbolconfiguration>`;
    expect(listOf(text).symbols[0]).toMatchObject({ iecType: "XWORD", aliasOf: "LWORD" });
  });
});

describe("refusals", () => {
  it("refuses a file of another format, naming the expected root", () => {
    const result = CODESYS_SYMBOLCONFIGURATION_FORMAT.parse("<Other/>");
    expect(result).toMatchObject({ ok: false, problems: [{ code: "wrong_format" }] });
  });

  it("refuses the right root in another namespace", () => {
    expect(CODESYS_SYMBOLCONFIGURATION_FORMAT.detect(`<Symbolconfiguration xmlns="urn:x"/>`)).toBe(
      false,
    );
  });

  it("refuses a file with no NodeList", () => {
    const text = `<Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"><Header/></Symbolconfiguration>`;
    expect(CODESYS_SYMBOLCONFIGURATION_FORMAT.parse(text)).toMatchObject({
      ok: false,
      problems: [{ code: "missing_node_list" }],
    });
  });

  it("carries the reader's refusal, for example a DOCTYPE", () => {
    const text = `<!DOCTYPE x><Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"/>`;
    expect(CODESYS_SYMBOLCONFIGURATION_FORMAT.parse(text)).toMatchObject({
      ok: false,
      problems: [{ code: "doctype_refused" }],
    });
  });

  it("refuses a file with more than 50 000 symbols", () => {
    const nodes = Array.from(
      { length: 50_001 },
      (_, index) => `<Node name="v${index}" type="T_BOOL"/>`,
    );
    const text = `<Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"><TypeList><TypeSimple name="T_BOOL" iecname="BOOL"/></TypeList><NodeList><Node name="Application">${nodes.join("")}</Node></NodeList></Symbolconfiguration>`;
    expect(CODESYS_SYMBOLCONFIGURATION_FORMAT.parse(text)).toMatchObject({
      ok: false,
      problems: [{ code: "too_many_symbols" }],
    });
  });
});

describe("the registry", () => {
  it("lists the format under its id and finds it", () => {
    expect(PLC_SYMBOL_FORMAT_IDS).toEqual(["codesys-symbolconfiguration"]);
    expect(findFormatById("codesys-symbolconfiguration")).toBe(CODESYS_SYMBOLCONFIGURATION_FORMAT);
    expect(findFormatById("tia")).toBeUndefined();
    expect(detectFormat("<a/>")).toBeUndefined();
  });
});

describe("types that expand without end", () => {
  const FILE_HEAD = `<Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd"><TypeList><TypeSimple name="T_BOOL" iecname="BOOL"/>`;
  const FILE_TAIL = `</TypeList><NodeList><Node name="A"><Node name="v" type="T_L0"/></Node></NodeList></Symbolconfiguration>`;
  const member = (name: string, type: string) =>
    `<UserDefElement iecname="${name}" type="${type}"/>`;
  const container = (name: string, members: string) =>
    `<TypeUserDef name="${name}" typeclass="Userdef" pouclass="STRUCTURE" iecname="${name}">${members}</TypeUserDef>`;

  it("refuses a fan-out of empty containers, which emits no symbol yet makes 10^8 visits", () => {
    const levels = Array.from({ length: 8 }, (_, level) =>
      container(
        `T_L${level}`,
        Array.from({ length: 10 }, (_unused, index) => member(`m${index}`, `T_L${level + 1}`)).join(
          "",
        ),
      ),
    );
    const text = `${FILE_HEAD}${levels.join("")}${container("T_L8", "")}${FILE_TAIL}`;
    expect(CODESYS_SYMBOLCONFIGURATION_FORMAT.parse(text)).toMatchObject({
      ok: false,
      problems: [{ code: "too_many_symbols" }],
    });
  });

  it("stops a type that has a member of its own type at the nesting limit", () => {
    const text = `${FILE_HEAD}${container("T_L0", `${member("self", "T_L0")}${member("flag", "T_BOOL")}`)}${FILE_TAIL}`;
    const list = listOf(text);
    expect(list.symbols.filter((symbol) => symbol.path.at(-1) === "flag")).toHaveLength(8);
    expect(list.warnings.some((warning) => warning.code === "nesting_too_deep")).toBe(true);
  });
});
