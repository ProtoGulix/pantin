import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { hingeJoint, railBody, stepBody, weldJoint } from "../test-fixtures.ts";
import { buildJointEditRequest, jointFormFor, jointFormSubmission } from "./joint-edit-form.ts";
import { initialJointForm, withJointFormType, withJointFormValue } from "./joint-form.ts";

function withoutId({ id: _id, tagKey: _tagKey, ...request }: Joint) {
  return request;
}

describe("jointFormFor", () => {
  it("prefills the shared fields and the parameters in display units", () => {
    const form = jointFormFor(hingeJoint);
    expect(form.jointId).toBe("hinge");
    expect(form.type).toBe("revolute");
    expect(form.values).toMatchObject({
      name: "Hinge",
      parent: "rail",
      child: "carriage",
      "origin.x": "10",
      "origin.z": "20",
      "axis.z": "1",
      "limits.lower": "-90",
      "limits.upper": "90",
    });
    expect(form.customAxis).toBe(false);
  });

  it("opens a custom axis with its components shown", () => {
    const oblique: Joint = { ...weldJoint, axis: [1, 1, 0] };
    expect(jointFormFor(oblique).customAxis).toBe(true);
  });
});

describe("buildJointEditRequest", () => {
  it("sends back the stored values of the fields left as shown, not their rounded text", () => {
    const precise: Joint = {
      id: "screw",
      tagKey: "screw",
      name: "Screw",
      type: "helical",
      parent: "rail",
      child: "carriage",
      limits: [0.0011111, 0.05],
      origin: [0.0123456, 0, 0],
      axis: [0.6, 0.8, 0],
      pitch: 0.00123456,
    };
    expect(buildJointEditRequest(jointFormFor(precise), precise)).toEqual({
      ok: true,
      request: withoutId(precise),
    });
  });

  it("turns a fixed joint into a slider with the limits the user typed (ADR 0018)", () => {
    let form = withJointFormType(jointFormFor(weldJoint), "prismatic");
    form = withJointFormValue(form, "limits.lower", "0");
    form = withJointFormValue(form, "limits.upper", "125");
    expect(buildJointEditRequest(form, weldJoint)).toEqual({
      ok: true,
      request: { ...withoutId(weldJoint), type: "prismatic", limits: [0, 0.125] },
    });
  });

  it("takes a changed field from the form", () => {
    const form = withJointFormValue(jointFormFor(weldJoint), "origin.x", "15");
    const built = buildJointEditRequest(form, weldJoint);
    expect(built.ok && built.request.origin).toEqual([0.015, 0, 0.02]);
  });

  it("reports the schema's message when the new type's parameters are missing", () => {
    const form = withJointFormType(jointFormFor(weldJoint), "helical");
    const built = buildJointEditRequest(form, weldJoint);
    expect(built.ok).toBe(false);
  });
});

describe("jointFormSubmission", () => {
  it("creates from a new form, and replaces the joint an edit form was opened on", () => {
    let created = initialJointForm([railBody, stepBody("carriage", "N_1")]);
    created = withJointFormValue(created, "name", "Weld");
    expect(jointFormSubmission(created, []).kind).toBe("create");
    expect(jointFormSubmission(jointFormFor(weldJoint), [weldJoint])).toMatchObject({
      kind: "update",
      jointId: "weld",
    });
  });

  it("never sends anything for a joint deleted since the form opened", () => {
    expect(jointFormSubmission(jointFormFor(weldJoint), [hingeJoint])).toEqual({ kind: "gone" });
  });

  it("reports an invalid request instead of sending it", () => {
    const form = withJointFormType(jointFormFor(weldJoint), "helical");
    expect(jointFormSubmission(form, [weldJoint]).kind).toBe("invalid");
  });
});
