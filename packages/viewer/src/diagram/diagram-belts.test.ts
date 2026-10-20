import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import { chainOfNode, createChainLinksCache, downstreamBodyIds } from "./diagram-chains.ts";
import { columnX } from "./diagram-constants.ts";
import {
  beltOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram-fixtures.ts";
import { fixedLinkReason } from "./diagram-link-targets.ts";
import { nodeTypeLabels } from "./diagram-texts.ts";
import { removalBetween } from "./diagram-wiring.ts";

// A conveyor: contactor-like drive, a cylinder standing for the motor, the drum
// joint, the belt, and an encoder watching the same drum.
const conveyor = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("drum", "a")],
  joints: [jointOf("spin", "drum", "continuous")],
  drives: [driveOf("v1", "a")],
  actuators: [cylinderOf("m1", "a", "v1", ["spin"])],
  sensors: [encoderOf("e1", "a", "spin")],
  belts: [beltOf("belt1", "a", "spin")],
});

describe("a belt in the chain diagram", () => {
  const diagram = layoutChainDiagram(conveyor, new Set(), "en");

  it("is the last node of its chain, in the column of the sensors, after them", () => {
    const belt = diagram.nodes.find((node) => node.id === "belt:belt1");
    const sensor = diagram.nodes.find((node) => node.id === "sensor:e1");
    expect(belt?.kind).toBe("belt");
    expect(belt?.column).toBe(3);
    expect(belt?.x).toBe(columnX(3));
    expect(belt?.y ?? 0).toBeGreaterThan(sensor?.y ?? 0);
  });

  it("is linked from its drum joint by a mechanical edge", () => {
    const edge = diagram.edges.find((candidate) => candidate.toNode === "belt:belt1");
    expect(edge).toMatchObject({ kind: "mechanical", fromNode: "joint:spin" });
  });

  it("has an anchor to its drum and nothing else", () => {
    const belt = diagram.nodes.find((node) => node.id === "belt:belt1");
    expect(belt?.sockets.map((socket) => socket.id)).toEqual(["in"]);
  });

  it("carries the translated type of a belt", () => {
    const labels = nodeTypeLabels(conveyor, "fr", createTranslator("fr"));
    expect(labels.get("belt:belt1")).toBe("Bande");
  });
});

describe("a belt in the links of the chains", () => {
  const links = createChainLinksCache()(conveyor);

  it("belongs to the chain of its drum: what feeds it, and the sensors beside it", () => {
    expect(chainOfNode(links, "belt:belt1")).toEqual(
      new Set(["drive:v1", "actuator:m1", "joint:spin", "belt:belt1"]),
    );
    expect(chainOfNode(links, "joint:spin")).toEqual(
      new Set(["drive:v1", "actuator:m1", "joint:spin", "sensor:e1", "belt:belt1"]),
    );
    expect(links.nodeIds.has("belt:belt1")).toBe(true);
  });

  it("moves no body of its own", () => {
    expect(downstreamBodyIds(links, "belt:belt1").size).toBe(0);
  });
});

describe("the link of a belt", () => {
  it("cannot be removed, and says why", () => {
    const edge = layoutChainDiagram(conveyor, new Set(), "en").edges.find(
      (candidate) => candidate.toNode === "belt:belt1",
    );
    expect(edge === undefined ? null : fixedLinkReason(edge)).toBe("diagram.edge.removeBelt");
    expect(removalBetween(conveyor, "joint:spin", "belt:belt1")).toMatchObject({
      ok: false,
      refusal: { key: "diagram.refusal.beltNeedsDrum" },
    });
  });
});
