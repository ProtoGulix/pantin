import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";
import { endpointLabel } from "./diagram-link-targets.ts";
import {
  diagramShortcuts,
  edgeDescription,
  nodeTypeLabels,
  portLabel,
  truncateLabel,
} from "./diagram-texts.ts";

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
  const { nodes } = layoutChainDiagram(document, new Set(), "en");
  const t = createTranslator("en");
  const nameOf = (nodeId: string, socketId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const socket = node?.sockets.find((candidate) => candidate.id === socketId);
    return node === undefined || socket === undefined ? null : portLabel(node, socket, t);
  };

  it("names a port by its side and name", () => {
    expect(nameOf("drive:v1", "out:port_4")).toBe("Output port Port 4");
    expect(nameOf("actuator:c1", "in:cap")).toBe("Input port Cap chamber (extends)");
  });

  it("names an anchor by what it links to", () => {
    expect(nameOf("actuator:c1", "out")).toBe("Link to the moved joints");
    expect(nameOf("joint:j1", "in")).toBe("Link from the actuator");
    expect(nameOf("sensor:e1", "in")).toBe("Link to the watched joint");
  });
});

describe("socket labels", () => {
  const document = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  });
  const labelsOf = (nodeId: string, language: "en" | "fr", role: string) =>
    layoutChainDiagram(document, new Set(), language)
      .nodes.find((node) => node.id === nodeId)
      ?.sockets.filter((socket) => socket.role === role)
      .map((socket) => socket.label);

  it("reads every socket from the labels of its type, never a raw key", () => {
    expect(labelsOf("drive:v1", "en", "output")).toEqual(["Port 2", "Port 4"]);
    expect(labelsOf("drive:v1", "en", "command")).toEqual(["Coil 14", "Coil 12"]);
    expect(labelsOf("actuator:c1", "en", "input")).toEqual([
      "Rod chamber (retracts)",
      "Cap chamber (extends)",
    ]);
    expect(labelsOf("sensor:e1", "en", "feedback")).toEqual(["Count"]);
  });

  it("follows the language", () => {
    expect(labelsOf("drive:v1", "fr", "output")).toEqual(["Orifice 2", "Orifice 4"]);
    expect(labelsOf("drive:v1", "fr", "command")).toEqual(["Bobine 14", "Bobine 12"]);
    expect(labelsOf("sensor:e1", "fr", "feedback")).toEqual(["Comptage"]);
  });
});

describe("edge and endpoint texts", () => {
  const document = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"], { cap: "port_4", rod: "port_2" })],
  });
  const diagram = layoutChainDiagram(document, new Set(), "en");
  const feed = diagram.edges.filter((edge) => edge.kind === "pneumatic");

  it("names a socket end by the node and the label of its socket", () => {
    expect(endpointLabel(diagram, { nodeId: "actuator:c1", socketId: "in:cap" })).toBe(
      "c1 · Cap chamber (extends)",
    );
  });

  it("names the anchor end by the node alone", () => {
    expect(endpointLabel(diagram, { nodeId: "actuator:c1", socketId: "out" })).toBe("c1");
  });

  it("describes each feed edge by both ends, so two edges differ", () => {
    const texts = feed.map((edge) => edgeDescription(diagram, edge, createTranslator("en")));
    expect(new Set(texts).size).toBe(2);
    expect(texts).toContain("Pneumatic link: v1 · Port 4 → c1 · Cap chamber (extends)");
  });
});

describe("diagramShortcuts", () => {
  it("lists the keys in both languages", () => {
    expect(diagramShortcuts(createTranslator("fr")).map((entry) => entry.keys)).toContain("Suppr");
    expect(diagramShortcuts(createTranslator("en")).map((entry) => entry.keys)).toContain("Del");
  });
});
