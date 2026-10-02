import { describe, expect, it } from "vitest";
import { nodeSelection } from "../selection.ts";
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
    expect(
      jointPreviewOf({ ...opened, selection: nodeSelection(bodyNodeId("press", "rail")) }),
    ).toBeNull();
  });

  it("shows the selected joint as stored", () => {
    expect(
      jointPreviewOf({ ...opened, selection: nodeSelection(jointNodeId("press", "hinge")) }),
    ).toEqual({
      parentBodyId: "rail",
      childBodyId: "carriage",
      origin: [0.01, 0, 0.02],
      axis: [0, 0, 1],
      driven: false,
    });
  });

  it("follows the form, origin converted to metres, even over a selected joint", () => {
    const form = withJointFormValue(initialJointForm(bodies), "origin.x", "250");
    const state = {
      ...opened,
      selection: nodeSelection(jointNodeId("press", "hinge")),
      jointForm: form,
    };
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

describe("jointPreviewOf under a body placement", () => {
  it("shows origin and axis as seen from a placed parent body (ADR 0033)", () => {
    const placedRail = {
      ...railBody,
      placement: {
        translation: [0.1, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
      },
    };
    const placed = withOpenPantin(
      initialViewerState("en"),
      pantinResponse(false, [placedRail, stepBody("carriage", "N_1")], "press", [hingeJoint]),
    );
    const preview = jointPreviewOf({
      ...placed,
      selection: nodeSelection(jointNodeId("press", "hinge")),
    });
    expect(preview?.origin?.[0]).toBeCloseTo(-0.09, 12);
    expect(preview?.origin?.[2]).toBeCloseTo(0.02, 12);
    expect(preview?.axis).toEqual([0, 0, 1]);
  });
});
