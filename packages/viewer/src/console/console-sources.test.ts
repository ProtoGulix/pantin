import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { consolePantin } from "./console-fixtures.ts";
import { consoleSourceLabel, consoleSourceTarget } from "./console-sources.ts";

const { document } = consolePantin;
const t = createTranslator("fr");

describe("consoleSourceLabel", () => {
  it("names the Pantin, a joint and each kind of device from the document", () => {
    expect(consoleSourceLabel(document, { kind: "pantin" }, t)).toBe("Test");
    expect(consoleSourceLabel(document, { kind: "joint", id: "j1" }, t)).toBe("j1");
    expect(consoleSourceLabel(document, { kind: "drive", id: "v1" }, t)).toBe("v1");
    expect(consoleSourceLabel(document, { kind: "actuator", id: "c1" }, t)).toBe("c1");
    expect(consoleSourceLabel(document, { kind: "sensor", id: "e1" }, t)).toBe("e1");
    expect(consoleSourceLabel(document, { kind: "body", id: "s1" }, t)).toBe("s1");
  });

  it("gives the id of a source that no longer exists, marked as deleted", () => {
    expect(consoleSourceLabel(document, { kind: "drive", id: "gone" }, t)).toBe("gone (supprimé)");
    expect(
      consoleSourceLabel(document, { kind: "joint", id: "gone" }, createTranslator("en")),
    ).toBe("gone (deleted)");
  });
});

describe("consoleSourceTarget", () => {
  it("selects a device as itself", () => {
    expect(consoleSourceTarget(document, "press", { kind: "sensor", id: "e1" })).toEqual({
      kind: "device",
      device: { kind: "sensor", id: "e1" },
    });
  });

  it("selects a joint as its row under its child body, and the Pantin as its root row", () => {
    expect(consoleSourceTarget(document, "press", { kind: "joint", id: "j1" })).toEqual({
      kind: "node",
      nodeId: jointNodeId("press", "j1", "s1"),
    });
    expect(consoleSourceTarget(document, "press", { kind: "pantin" })).toEqual({
      kind: "node",
      nodeId: pantinNodeId("press"),
    });
  });

  it("selects a body as its row", () => {
    expect(consoleSourceTarget(document, "press", { kind: "body", id: "s1" })).toEqual({
      kind: "node",
      nodeId: bodyNodeId("press", "s1"),
    });
  });

  it("selects nothing for a source that no longer exists", () => {
    expect(consoleSourceTarget(document, "press", { kind: "drive", id: "gone" })).toBeNull();
    expect(consoleSourceTarget(document, "press", { kind: "joint", id: "gone" })).toBeNull();
    expect(consoleSourceTarget(document, "press", { kind: "body", id: "gone" })).toBeNull();
  });
});
