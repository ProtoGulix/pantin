import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";
import { diagramShortcuts, nodeTypeLabels, portLabel, truncateLabel } from "./diagram-texts.ts";

describe("truncateLabel", () => {
  it("keeps a short label and cuts a long one with an ellipsis", () => {
    expect(truncateLabel("Pince", 144)).toBe("Pince");
    const cut = truncateLabel("a".repeat(60), 144);
    expect([...cut].length).toBeLessThan(60);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("nodeTypeLabels", () => {
  const document = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  });

  it("translates the type of every kind of node", () => {
    const labels = nodeTypeLabels(document, "en", createTranslator("en"));
    expect(labels.get("drive:v1")).toBe("Valve 5/2, double solenoid");
    expect(labels.get("joint:j1")).toBe("Prismatic (slider)");
    expect(labels.get("actuator:c1")).toBeTruthy();
    expect(labels.get("sensor:e1")).toBeTruthy();
  });

  it("follows the language", () => {
    const labels = nodeTypeLabels(document, "fr", createTranslator("fr"));
    expect(labels.get("drive:v1")).toBe("Distributeur 5/2, bistable");
  });
});

describe("portLabel", () => {
  const document = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  });
  const { nodes } = layoutChainDiagram(document, new Set());
  const t = createTranslator("en");
  const nameOf = (nodeId: string, socketId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const socket = node?.sockets.find((candidate) => candidate.id === socketId);
    return node === undefined || socket === undefined ? null : portLabel(node, socket, t);
  };

  it("names a port by its side and name", () => {
    expect(nameOf("drive:v1", "out:port_4")).toBe("Output port port_4");
    expect(nameOf("actuator:c1", "in:cap")).toBe("Input port cap");
  });

  it("names an anchor by what it links to", () => {
    expect(nameOf("actuator:c1", "out")).toBe("Link to the moved joints");
    expect(nameOf("joint:j1", "in")).toBe("Link from the actuator");
    expect(nameOf("sensor:e1", "in")).toBe("Link to the watched joint");
  });
});

describe("diagramShortcuts", () => {
  it("lists the keys in both languages", () => {
    expect(diagramShortcuts(createTranslator("fr")).map((entry) => entry.keys)).toContain("Suppr");
    expect(diagramShortcuts(createTranslator("en")).map((entry) => entry.keys)).toContain("Del");
  });
});
