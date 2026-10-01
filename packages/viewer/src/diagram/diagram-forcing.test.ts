import { describe, expect, it } from "vitest";
import { forcedTagUnitLabel } from "../drives/drive-tags.ts";
import { createTranslator } from "../i18n/translate.ts";
import {
  commandSocketName,
  forcedDisplayNumber,
  forcedValueText,
  parseForcedInput,
  type SocketPress,
  socketAction,
  socketOf,
} from "./diagram-forcing.ts";
import type { Socket } from "./diagram-types.ts";
import { wiringDiagram, wiringDocument } from "./diagram-wiring-fixtures.ts";

// What a click or a key does on each kind of socket (ADR 0030 point 3).

const socketNamed = (nodeId: string, socketId: string): Socket => {
  const socket = socketOf(wiringDiagram, { nodeId, socketId });
  if (socket === null) {
    throw new Error(`no socket ${nodeId} ${socketId}`);
  }
  return socket;
};

const bit = socketNamed("drive:v1", "tag:coil_14");
const number = socketNamed("drive:sv", "tag:setpoint");
const output = socketNamed("drive:v1", "out:port_2");
const input = socketNamed("actuator:cyl1", "in:cap");
const feedback = socketNamed("sensor:e1", "tag:count");
const presses: SocketPress[] = ["click", "enter", "space", "menu"];
const none = { kind: "none" };

describe("socketAction", () => {
  it("toggles a bit command on a click or Space, and does nothing else", () => {
    const toggle = { kind: "toggle", tag: "a.v1.coil_14" };
    expect(presses.map((press) => socketAction(bit, press))).toEqual([toggle, none, toggle, none]);
  });

  it("opens the input of a numeric command on a click or Enter", () => {
    const open = { kind: "openInput", tag: "a.sv.setpoint" };
    expect(presses.map((press) => socketAction(number, press))).toEqual([open, open, none, none]);
  });

  it("opens the link menu on Enter or the menu key of a power port, never on a click", () => {
    const menu = { kind: "openLinkMenu" };
    for (const port of [output, input]) {
      expect(presses.map((press) => socketAction(port, press))).toEqual([none, menu, none, menu]);
    }
  });

  it("never opens the link menu from a tag: a tag is not linked", () => {
    for (const tag of [bit, number, feedback]) {
      expect(presses.some((press) => socketAction(tag, press).kind === "openLinkMenu")).toBe(false);
    }
  });

  it("leaves a sensor's tag read only", () => {
    expect(presses.map((press) => socketAction(feedback, press))).toEqual([none, none, none, none]);
  });
});

describe("the sockets the diagram builds", () => {
  it("tells a bit command from a numeric one, and gives no type to the rest", () => {
    expect(bit.tagType).toBe("bit");
    expect(number.tagType).toBe("number");
    expect(output.tagType).toBeUndefined();
    expect(feedback.tagType).toBeUndefined();
  });

  it("finds a socket from a focus target, and none for a node", () => {
    expect(socketOf(wiringDiagram, { nodeId: "drive:v1", socketId: null })).toBeNull();
    expect(socketOf(wiringDiagram, { nodeId: "drive:v1", socketId: "tag:ghost" })).toBeNull();
  });
});

describe("parseForcedInput", () => {
  it("reads a number with a decimal point or comma, spaces around", () => {
    expect(parseForcedInput("40")).toEqual({ ok: true, value: 40 });
    expect(parseForcedInput(" -2,5 ")).toEqual({ ok: true, value: -2.5 });
  });

  it("refuses an empty field and text", () => {
    expect(parseForcedInput("")).toEqual({ ok: false });
    expect(parseForcedInput("   ")).toEqual({ ok: false });
    expect(parseForcedInput("4x")).toEqual({ ok: false });
  });
});

describe("the accessible name of a command", () => {
  const t = createTranslator("en");

  it("says a bit can be toggled and a number set, with its value once known", () => {
    expect(commandSocketName(bit, t)).toContain(bit.label);
    expect(commandSocketName(bit, t)).toMatch(/toggle/);
    expect(commandSocketName(number, t)).toMatch(/set a value/);
    expect(commandSocketName(number, t, { text: "40 mm" })).toContain("40 mm");
  });

  it("is translated", () => {
    expect(commandSocketName(bit, createTranslator("fr"))).toMatch(/basculer/);
  });
});

describe("the value of a numeric command", () => {
  it("is shown in display units with its symbol", () => {
    const t = createTranslator("en");
    expect(forcedTagUnitLabel(wiringDocument, "a.sv.setpoint", t)).toBe("mm");
    expect(forcedTagUnitLabel(wiringDocument, "a.nothing", t)).toBeNull();
    expect(forcedValueText(0.04, "metre", "mm")).toBe("40 mm");
    expect(forcedValueText(60, null, null)).toBe("60");
  });
});

describe("the current value in the input", () => {
  it("is a plain number in display units, to start the field with", () => {
    expect(forcedDisplayNumber(0.04, "metre")).toBe("40");
    expect(forcedDisplayNumber(60, null)).toBe("60");
  });
});
