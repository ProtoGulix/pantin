import { describe, expect, it } from "vitest";
import {
  edgeInto,
  edgesFrom,
  type FocusTarget,
  firstPortOf,
  focusKeyOf,
  focusTargets,
  neighbour,
} from "./diagram-focus.ts";
import { wiringDiagram } from "./diagram-wiring-fixtures.ts";

// Keyboard navigation (ADR 0029 point 7): reading order and arrow keys.

const node = (nodeId: string): FocusTarget => ({ nodeId, socketId: null });
const port = (nodeId: string, socketId: string): FocusTarget => ({ nodeId, socketId });
const keyAfter = (from: FocusTarget, direction: "left" | "right" | "up" | "down") => {
  const next = neighbour(wiringDiagram, from, direction);
  return next === null ? null : focusKeyOf(next);
};

describe("focusTargets", () => {
  const keys = focusTargets(wiringDiagram).map(focusKeyOf);

  it("lists each node followed by its ports, in the layout's reading order", () => {
    const nodeKeys = keys.filter((key) => key.startsWith("node:"));
    expect(nodeKeys).toEqual(wiringDiagram.nodes.map((n) => `node:${n.id}`));
    const at = keys.indexOf("node:drive:v1");
    expect(keys.slice(at + 1, at + 3)).toEqual([
      "port:drive:v1|out:port_2",
      "port:drive:v1|out:port_4",
    ]);
  });

  it("leaves out the tags, which only show a value", () => {
    expect(keys.some((key) => key.includes("|tag:"))).toBe(false);
  });

  it("puts a node's left ports before its right ones", () => {
    const at = keys.indexOf("node:actuator:cyl1");
    const own = keys.slice(at + 1).filter((key) => key.startsWith("port:actuator:cyl1|"));
    expect(own.at(-1)).toBe("port:actuator:cyl1|out");
  });
});

describe("neighbour on a node", () => {
  it("follows the chain: right to what it feeds, left to what feeds it", () => {
    expect(keyAfter(node("drive:v1"), "right")).toBe("node:actuator:cyl1");
    expect(keyAfter(node("actuator:cyl1"), "right")).toBe("node:joint:j1");
    expect(keyAfter(node("joint:j1"), "right")).toBe("node:sensor:e1");
    expect(keyAfter(node("sensor:e1"), "left")).toBe("node:joint:j1");
    expect(keyAfter(node("joint:j1"), "left")).toBe("node:actuator:cyl1");
  });

  it("stays put where the chain ends", () => {
    expect(keyAfter(node("sensor:e1"), "right")).toBeNull();
    expect(keyAfter(node("drive:v1"), "left")).toBeNull();
  });

  it("goes up and down between the nodes of a column", () => {
    const drives = wiringDiagram.nodes.filter((n) => n.kind === "drive").map((n) => n.id);
    const [first, second] = drives;
    expect(first && second && keyAfter(node(first), "down")).toBe(`node:${second}`);
    expect(first && second && keyAfter(node(second), "up")).toBe(`node:${first}`);
    expect(first && keyAfter(node(first), "up")).toBeNull();
  });
});

describe("neighbour on a port", () => {
  it("crosses the link with left and right", () => {
    expect(keyAfter(port("drive:v1", "out:port_4"), "right")).toBe("port:actuator:cyl1|in:cap");
    expect(keyAfter(port("actuator:cyl1", "in:rod"), "left")).toBe("port:drive:v1|out:port_2");
  });

  it("does nothing on a port without a link in that direction", () => {
    expect(keyAfter(port("actuator:cyl2", "in:cap"), "left")).toBeNull();
  });

  it("walks the ports of its side with up and down", () => {
    const [first, second] =
      wiringDiagram.nodes
        .find((n) => n.id === "actuator:cyl1")
        ?.sockets.filter((s) => s.role === "input") ?? [];
    expect(first && second && keyAfter(port("actuator:cyl1", first.id), "down")).toBe(
      `port:actuator:cyl1|${second?.id}`,
    );
    expect(first && keyAfter(port("actuator:cyl1", first.id), "up")).toBeNull();
  });
});

describe("firstPortOf and edgeInto", () => {
  it("enters a node by its first port, if it has one", () => {
    expect(firstPortOf(wiringDiagram, "actuator:cyl1")?.socketId).toMatch(/^in:/);
    expect(firstPortOf(wiringDiagram, "nope:x")).toBeNull();
  });

  it("finds the link that ends at a port, for Delete", () => {
    expect(edgeInto(wiringDiagram, port("actuator:cyl1", "in:cap"))?.fromNode).toBe("drive:v1");
    expect(edgeInto(wiringDiagram, port("joint:j1", "in"))?.fromNode).toBe("actuator:cyl1");
    expect(edgeInto(wiringDiagram, port("actuator:cyl2", "in:cap"))).toBeNull();
  });
});

describe("edgesFrom", () => {
  it("lists the links that leave a port, for Delete on an output", () => {
    expect(edgesFrom(wiringDiagram, port("drive:v1", "out:port_4")).map((e) => e.toNode)).toEqual([
      "actuator:cyl1",
    ]);
    expect(edgesFrom(wiringDiagram, port("drive:v2", "out:port_4"))).toEqual([]);
  });
});
