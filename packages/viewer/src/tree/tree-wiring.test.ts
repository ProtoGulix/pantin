import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { hingeJoint, pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";

// The marks of a joint's wiring in the tree: its drive and its sensors.

const translate = createTranslator("fr");

describe("driven joints in the tree (ADR 0022)", () => {
  it("marks a driven joint with a bolt and says which drive moves it", () => {
    const carriage = stepBody("carriage", "Carriage");
    const pantin = pantinResponse(false, [railBody, carriage], "press", [hingeJoint, slideJoint]);
    const valve = {
      id: "valve",
      tagKey: "valve",
      name: "Valve",
      assembly: "main",
      joints: ["hinge"],
      type: "double_acting_cylinder" as const,
      speed: 1,
    };
    const document = { ...pantin.document, drives: [valve] };
    const tree = buildTree({ openPantin: { ...pantin, document } }, translate);
    expect(findNode(tree, jointNodeId("press", "hinge"))).toMatchObject({
      icon: "joint",
      wiring: { driveId: "valve", sensorIds: [] },
      stateLabel: "pilotée par Valve",
    });
    // Under its body too, where the same joint is listed again.
    expect(findNode(tree, jointNodeId("press", "hinge", "rail"))?.wiring?.driveId).toBe("valve");
    expect(findNode(tree, jointNodeId("press", "slide"))).toMatchObject({
      wiring: { driveId: null, sensorIds: [] },
      stateLabel: null,
    });
  });

  it("marks a watched joint and names its sensors, after its drive (ADR 0023)", () => {
    const carriage = stepBody("carriage", "Carriage");
    const pantin = pantinResponse(false, [railBody, carriage], "press", [slideJoint]);
    const sensor = (id: string, name: string) => ({
      id,
      tagKey: id,
      name,
      assembly: "main",
      joint: "slide",
      type: "encoder" as const,
      pulsesPerUnit: 1000,
    });
    const document = {
      ...pantin.document,
      sensors: [sensor("low", "Low"), sensor("high", "High")],
    };
    const tree = buildTree({ openPantin: { ...pantin, document } }, translate);
    expect(findNode(tree, jointNodeId("press", "slide"))).toMatchObject({
      wiring: { driveId: null, sensorIds: ["low", "high"] },
      stateLabel: "surveillée par Low, High",
    });
    expect(findNode(tree, bodyNodeId("press", "rail"))?.wiring).toBeNull();
  });
});
