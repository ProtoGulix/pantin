import { describe, expect, it } from "vitest";
import { type PropertyRow, row } from "./property-rows.ts";
import { rowTagName } from "./row-tag.ts";

const plain: PropertyRow = row("name", "Name", "Valve");

function withEdit(edit: PropertyRow["edit"]): PropertyRow {
  return { ...plain, edit };
}

describe("rowTagName", () => {
  it("finds the tag of a bit command, a numeric command and a live value", () => {
    const toggle = withEdit({
      input: "toggle",
      action: { kind: "bitTag", tag: "a.v.coil" },
      on: false,
    });
    const number = withEdit({ input: "number", tag: "a.v.setpoint" });
    const live: PropertyRow = {
      ...plain,
      live: { kind: "tag", tag: "a.v.position", unit: "metre", format: "number" },
    };
    expect([toggle, number, live].map(rowTagName)).toEqual([
      "a.v.coil",
      "a.v.setpoint",
      "a.v.position",
    ]);
  });

  it("has none for a fault toggle, a text row or a link", () => {
    const fault = withEdit({
      input: "toggle",
      action: { kind: "driveUnresponsive", driveId: "v" },
      on: false,
    });
    const link: PropertyRow = { ...plain, link: { kind: "node", nodeId: "n" } };
    expect([plain, fault, link].map(rowTagName)).toEqual([null, null, null]);
  });
});
