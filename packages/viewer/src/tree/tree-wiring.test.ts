import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  hingeJoint,
  pantinResponse,
  railBody,
  slideJoint,
  sourceOf,
  stepBody,
} from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";

// The marks of a joint's wiring in the tree: its actuator and its sensors.

const translate = createTranslator("fr");
const cylinder = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "main",
  joints: ["hinge"],
  type: "ac_motor" as const,
  nominalSpeed: 1,
};

describe("moved joints in the tree (ADR 0028)", () => {
  it("marks a moved joint with a bolt and says which actuator moves it", () => {
    const carriage = stepBody("carriage", "Carriage");
    const pantin = pantinResponse(false, [railBody, carriage], "press", [hingeJoint, slideJoint]);
    const document = { ...pantin.document, actuators: [cylinder] };
    const tree = buildTree(sourceOf({ openPantin: { ...pantin, document } }), translate);
    expect(findNode(tree, jointNodeId("press", "hinge"))).toMatchObject({
      icon: "joint",
      wiring: { actuatorId: "cylinder", sensorIds: [] },
      stateLabel: "déplacée par Cylinder",
    });
    // Under its body too, where the same joint is listed again.
    expect(findNode(tree, jointNodeId("press", "hinge", "rail"))?.wiring?.actuatorId).toBe(
      "cylinder",
    );
    expect(findNode(tree, jointNodeId("press", "slide"))).toMatchObject({
      wiring: { actuatorId: null, sensorIds: [] },
      stateLabel: null,
    });
  });

  it("marks a watched joint and names its sensors, after its actuator (ADR 0023)", () => {
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
    const tree = buildTree(sourceOf({ openPantin: { ...pantin, document } }), translate);
    expect(findNode(tree, jointNodeId("press", "slide"))).toMatchObject({
      wiring: { actuatorId: null, sensorIds: ["low", "high"] },
      stateLabel: "surveillée par Low, High",
    });
    expect(findNode(tree, bodyNodeId("press", "rail"))?.wiring).toBeNull();
  });
});
