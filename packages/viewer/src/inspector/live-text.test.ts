import type { DriveRuntime } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import type { LiveSource } from "../properties/property-rows.ts";
import { liveText } from "./live-text.ts";

// What a live cell shows after a tag read.

const t = createTranslator("fr");
const none: ReadonlyMap<string, DriveRuntime> = new Map();

const bit: LiveSource = { kind: "tag", tag: "a.v1.coil_14", unit: null, format: "bit" };
const position: LiveSource = { kind: "tag", tag: "a.j1.position", unit: "metre", format: "number" };
const status: LiveSource = {
  kind: "driveStatus",
  driveId: "v1",
  driveType: "valve_5_2_double",
  commands: [
    { tag: "a.v1.coil_14", label: "Bobine 14" },
    { tag: "a.v1.coil_12", label: "Bobine 12" },
  ],
};

describe("liveText", () => {
  it("shows a bit as On or Off, and a position in mm", () => {
    const tags = new Map([
      ["a.v1.coil_14", 1],
      ["a.j1.position", 0.0125],
    ]);
    expect(liveText(bit, tags, none, t)).toBe("Marche");
    expect(liveText(bit, new Map([["a.v1.coil_14", 0]]), none, t)).toBe("Arrêt");
    expect(liveText(position, tags, none, t)).toBe("12.5");
  });

  it("keeps the cell as it is while the core has not reported the tag", () => {
    expect(liveText(bit, new Map(), none, t)).toBeNull();
    expect(
      liveText(
        { kind: "diagnostics", driveId: "v1", driveType: "valve_5_2_double" },
        new Map(),
        none,
        t,
      ),
    ).toBeNull();
  });
});

describe("liveText of a drive", () => {
  it("names the lit commands of a drive", () => {
    const tags = new Map([
      ["a.v1.coil_14", 1],
      ["a.v1.coil_12", 0],
    ]);
    expect(liveText(status, tags, none, t)).toBe("Bobine 14");
    expect(
      liveText(
        status,
        new Map([
          ["a.v1.coil_12", 1],
          ["a.v1.coil_14", 1],
        ]),
        none,
        t,
      ),
    ).toBe("Bobine 14, Bobine 12");
    expect(liveText(status, new Map(), none, t)).toBe("");
  });

  it("puts the diagnostic of a drive before its lit commands", () => {
    const runtime = new Map([
      ["v1", { id: "v1", ports: {}, diagnostics: ["conflicting_commands" as const] }],
    ]);
    const text = liveText(status, new Map([["a.v1.coil_14", 1]]), runtime, t);
    expect(text).toBe(t("drives.diagnostic.conflicting_commands.valve"));
  });
});
