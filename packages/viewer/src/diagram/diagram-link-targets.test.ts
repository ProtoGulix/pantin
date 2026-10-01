import { describe, expect, it } from "vitest";
import { edgeDragSource, isDragSource, linkChoices, linkTargets } from "./diagram-link-targets.ts";
import { wiringDiagram, wiringDocument } from "./diagram-wiring-fixtures.ts";

describe("linkTargets", () => {
  const from = { nodeId: "drive:v1", socketId: "out:port_4" };
  const targets = linkTargets(wiringDocument, wiringDiagram, from);
  const keyOf = (target: (typeof targets)[number]) =>
    `${target.endpoint.nodeId}|${target.endpoint.socketId}`;

  it("offers the actuator input ports, allowed when the domain matches", () => {
    const allowed = targets.filter(({ result }) => result.ok).map(keyOf);
    expect(allowed).toContain("actuator:cyl2|in:cap");
    expect(allowed).toContain("actuator:cyl1|in:rod");
    // The port it already feeds is not a new link.
    expect(allowed).not.toContain("actuator:cyl1|in:cap");
  });

  it("keeps a port of another domain as a refused target, to be dimmed", () => {
    const motor = targets.find((target) => keyOf(target) === "actuator:motor|in:in");
    expect(motor?.result.ok).toBe(false);
  });

  it("leaves out sockets that can never pair with it", () => {
    const kinds = new Set(targets.map((target) => target.endpoint.nodeId.split(":")[0]));
    expect(kinds).toEqual(new Set(["actuator"]));
  });

  it("offers a joint once, as a whole, to an actuator", () => {
    const joints = linkTargets(wiringDocument, wiringDiagram, {
      nodeId: "actuator:cyl2",
      socketId: "out",
    }).filter(({ endpoint }) => endpoint.nodeId.startsWith("joint:"));
    expect(joints.map((target) => target.endpoint.nodeId).sort()).toEqual([
      "joint:j1",
      "joint:j2",
      "joint:j3",
      "joint:jr",
    ]);
    expect(joints.find((t) => t.endpoint.nodeId === "joint:j2")?.result.ok).toBe(false);
    expect(joints.find((t) => t.endpoint.nodeId === "joint:j3")?.result.ok).toBe(true);
  });
});

describe("linkChoices", () => {
  it("lists what the core would accept, named by node and port", () => {
    const choices = linkChoices(wiringDocument, wiringDiagram, {
      nodeId: "actuator:cyl2",
      socketId: "in:cap",
    });
    expect(choices.map((choice) => choice.label)).toEqual(
      expect.arrayContaining(["v1 · Port 2", "v1 · Port 4", "v2 · Port 4"]),
    );
    expect(choices.some((choice) => choice.label.startsWith("sv"))).toBe(false);
  });

  it("lists the actuators and sensors that a joint can be linked to", () => {
    const labels = linkChoices(wiringDocument, wiringDiagram, {
      nodeId: "joint:j3",
      socketId: "in",
    }).map((choice) => choice.label);
    expect(labels).toEqual(expect.arrayContaining(["cyl1", "cyl2", "motor", "e1"]));
  });
});

describe("what can be dragged from", () => {
  it("is a drive output, an actuator's right anchor and a sensor's left anchor", () => {
    expect(isDragSource({ nodeId: "drive:v1", socketId: "out:port_2" })).toBe(true);
    expect(isDragSource({ nodeId: "actuator:cyl1", socketId: "out" })).toBe(true);
    expect(isDragSource({ nodeId: "sensor:e1", socketId: "in" })).toBe(true);
    expect(isDragSource({ nodeId: "actuator:cyl1", socketId: "in:cap" })).toBe(false);
    expect(isDragSource({ nodeId: "joint:j1", socketId: "in" })).toBe(false);
  });

  it("includes a sensor's wire, which ends at the sensor", () => {
    const wire = wiringDiagram.edges.find((edge) => edge.kind === "observation");
    expect(wire && edgeDragSource(wire)).toEqual({ nodeId: "sensor:e1", socketId: "in" });
    const feed = wiringDiagram.edges.find((edge) => edge.kind === "pneumatic");
    expect(feed && edgeDragSource(feed)).toBeNull();
  });
});
