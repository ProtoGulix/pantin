import { describe, expect, it } from "vitest";
import { hingeJoint, pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { initialJointForm, withJointFormValue } from "./joint-form.ts";
import { jointPreviewOf } from "./joint-preview.ts";

const bodies = [railBody, stepBody("carriage", "N_1")];
const opened = withOpenPantin(
  initialViewerState("en"),
  pantinResponse(false, bodies, "press", [hingeJoint]),
);

describe("jointPreviewOf", () => {
  it("shows nothing without a form or a selected joint", () => {
    expect(jointPreviewOf(opened)).toBeNull();
    expect(jointPreviewOf({ ...opened, selectedNodeId: bodyNodeId("press", "rail") })).toBeNull();
  });

  it("shows the selected joint as stored", () => {
    expect(jointPreviewOf({ ...opened, selectedNodeId: jointNodeId("press", "hinge") })).toEqual({
      parentBodyId: "rail",
      childBodyId: "carriage",
      origin: [0.01, 0, 0.02],
      axis: [0, 0, 1],
      driven: false,
    });
  });

  it("follows the form, origin converted to metres, even over a selected joint", () => {
    const form = withJointFormValue(initialJointForm(bodies), "origin.x", "250");
    const state = { ...opened, selectedNodeId: jointNodeId("press", "hinge"), jointForm: form };
    expect(jointPreviewOf(state)).toEqual({
      parentBodyId: "rail",
      childBodyId: "carriage",
      origin: [0.25, 0, 0],
      axis: [0, 0, 1],
      driven: false,
    });
  });

  it("drops the arrow parts the form cannot give yet", () => {
    const halfTyped = withJointFormValue(initialJointForm(bodies), "origin.y", "-");
    const zeroAxis = withJointFormValue(initialJointForm(bodies), "axis.z", "0");
    expect(jointPreviewOf({ ...opened, jointForm: halfTyped })?.origin).toBeNull();
    expect(jointPreviewOf({ ...opened, jointForm: zeroAxis })?.axis).toBeNull();
  });
});
