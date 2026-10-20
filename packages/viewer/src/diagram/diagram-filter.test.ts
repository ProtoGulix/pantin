import { describe, expect, it } from "vitest";
import { layoutChainDiagram } from "./chain-layout.ts";
import { filterNeedle, matchingNodeIds } from "./diagram-filter.ts";
import {
  beltOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram-fixtures.ts";

// Two chains: valve "press" feeds a cylinder moving j1, watched by an encoder;
// valve "clamp" feeds a cylinder moving j2; a belt rests on the drum j3.
const machine = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a"), bodyOf("drum", "a")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2"), jointOf("j3", "drum", "continuous")],
  drives: [driveOf("press", "a"), driveOf("clamp", "a")],
  actuators: [cylinderOf("c1", "a", "press", ["j1"]), cylinderOf("c2", "a", "clamp", ["j2"])],
  sensors: [encoderOf("e1", "a", "j1")],
  belts: [beltOf("feed", "a", "j3")],
});

const idsOf = (query: string) =>
  layoutChainDiagram(machine, new Set(), "en", query).nodes.map((node) => node.id);

describe("the diagram filter", () => {
  it("keeps every chain for an empty or blank text", () => {
    const everything = idsOf("");
    expect(everything).toContain("drive:clamp");
    expect(idsOf("   ")).toEqual(everything);
  });

  it("keeps the whole chain of a node whose name matches, and drops the others", () => {
    expect(idsOf("clamp")).toEqual(["drive:clamp", "actuator:c2", "joint:j2"]);
  });

  it("matches by tag: the full name of a command or feedback tag", () => {
    // The encoder e1 of the assembly a has a tag whose name holds "a.e1".
    expect(idsOf("a.e1")).toContain("sensor:e1");
    expect(idsOf("a.e1")).toContain("drive:press");
    expect(idsOf("a.e1")).not.toContain("drive:clamp");
  });

  it("finds a belt and keeps its chain, a joint without actuator being a root", () => {
    expect(idsOf("feed")).toEqual(["joint:j3", "belt:feed"]);
  });

  it("ignores case and accents", () => {
    expect(idsOf("CLAMP")).toEqual(idsOf("clamp"));
    expect(filterNeedle("  Étau ")).toBe("etau");
  });

  it("finds an accented label from its unaccented text through the layout", () => {
    const accented = documentOf({
      assemblies: ["a"],
      bodies: [],
      drives: [{ ...driveOf("v1", "a"), name: "Étau" }, driveOf("v2", "a")],
    });
    const ids = layoutChainDiagram(accented, new Set(), "en", "etau").nodes.map((node) => node.id);
    expect(ids).toEqual(["drive:v1"]);
  });

  it("draws nothing when no chain matches", () => {
    expect(idsOf("nothing like this")).toEqual([]);
  });
});

describe("matchingNodeIds", () => {
  const diagram = layoutChainDiagram(machine, new Set(), "en", "press");

  it("marks only the nodes that match, not the rest of their chain", () => {
    expect(matchingNodeIds(diagram, "press")).toEqual(new Set(["drive:press"]));
  });

  it("is empty for an empty text", () => {
    expect(matchingNodeIds(diagram, "")).toEqual(new Set());
  });
});
