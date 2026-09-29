import { JOINT_COORDINATE_UNITS, JOINT_PARAMETERS, type Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { hingeJoint, screwJoint, weldJoint } from "../test-fixtures.ts";
import { axisDirectionEdit, buildJointUpdate } from "./joint-update.ts";

function requestOf(joint: Joint, fieldId: string, text: string) {
  const built = buildJointUpdate(joint, fieldId, text);
  if (!built.ok) {
    throw new Error(built.message);
  }
  return built.request;
}

const { id: _hingeId, ...hingeRequest } = hingeJoint;
const { id: _screwId, ...screwRequest } = screwJoint;

describe("buildJointUpdate", () => {
  it("picks the fixtures by declared unit and parameter, not by name", () => {
    expect(JOINT_COORDINATE_UNITS[hingeJoint.type]).toBe("radian");
    expect(JOINT_COORDINATE_UNITS[screwJoint.type]).toBe("metre");
    expect(JOINT_PARAMETERS[screwJoint.type].map((p) => p.kind)).toEqual([
      "coordinateRange",
      "length",
    ]);
  });

  it("renames and rebinds bodies, keeping everything else as stored", () => {
    expect(requestOf(hingeJoint, "name", "Elbow")).toEqual({ ...hingeRequest, name: "Elbow" });
    expect(requestOf(hingeJoint, "child", "arm")).toEqual({ ...hingeRequest, child: "arm" });
    expect(requestOf(hingeJoint, "parent", "base")).toEqual({ ...hingeRequest, parent: "base" });
  });

  it("converts an origin component from millimetres to metres", () => {
    expect(requestOf(hingeJoint, "origin.y", "250")).toEqual({
      ...hingeRequest,
      origin: [hingeRequest.origin[0], 0.25, hingeRequest.origin[2]],
    });
  });

  it("takes a decimal comma and keeps the axis unitless", () => {
    expect(requestOf(hingeJoint, "axis.x", "0,5")).toEqual({
      ...hingeRequest,
      axis: [0.5, hingeRequest.axis[1], hingeRequest.axis[2]],
    });
  });

  it("converts radian limits from degrees, changing only the edited bound", () => {
    const request = requestOf(hingeJoint, "limits.upper", "180");
    expect(request).toEqual({ ...hingeRequest, limits: [-Math.PI / 2, Math.PI] });
  });

  it("converts metre limits and the pitch from millimetres", () => {
    expect(requestOf(screwJoint, "limits.lower", "10")).toEqual({
      ...screwRequest,
      limits: [0.01, 0.05],
    });
    expect(requestOf(screwJoint, "pitch.value", "4")).toEqual({ ...screwRequest, pitch: 0.004 });
  });

  it("does not round the fields it does not edit", () => {
    const precise: Joint = { ...hingeJoint, origin: [0.0123456, 0, 0] };
    expect(requestOf(precise, "name", "Precise")).toMatchObject({ origin: [0.0123456, 0, 0] });
  });
});

describe("buildJointUpdate failures", () => {
  it("reports the schema's message when the edit breaks a rule", () => {
    const crossed = buildJointUpdate(hingeJoint, "limits.lower", "120");
    expect(crossed).toEqual({
      ok: false,
      message: expect.stringContaining("The lower limit must not exceed the upper one."),
    });
    const zeroAxis = buildJointUpdate({ ...hingeJoint, axis: [0, 0, 1] }, "axis.z", "0");
    expect(zeroAxis).toEqual({
      ok: false,
      message: expect.stringContaining("The axis must not be the zero vector."),
    });
  });

  it("refuses text that is not a number", () => {
    expect(buildJointUpdate(hingeJoint, "origin.x", "abc").ok).toBe(false);
    expect(buildJointUpdate(hingeJoint, "origin.x", "").ok).toBe(false);
  });

  it("refuses a field the joint does not have", () => {
    expect(buildJointUpdate(weldJoint, "limits.lower", "1")).toEqual({
      ok: false,
      message: "Unknown joint field: limits.lower.",
    });
  });

  it("sets the axis from a direction, keeping its sense", () => {
    const reversed: Joint = { ...hingeJoint, axis: [0, -1, 0] };
    expect(requestOf(reversed, "axis.direction", "x").axis).toEqual([-1, 0, 0]);
  });

  it("reverses the axis only when the sense changes", () => {
    const oblique: Joint = { ...hingeJoint, axis: [1, 1, 0] };
    expect(requestOf(oblique, "axis.sense", "reversed").axis).toEqual([-1, -1, 0]);
    expect(requestOf(oblique, "axis.sense", "positive").axis).toEqual([1, 1, 0]);
  });

  it("refuses an unknown direction or sense", () => {
    expect(buildJointUpdate(hingeJoint, "axis.direction", "w").ok).toBe(false);
    expect(buildJointUpdate(hingeJoint, "axis.sense", "up").ok).toBe(false);
  });
});

describe("axisDirectionEdit", () => {
  it("only reveals the components on custom", () => {
    expect(axisDirectionEdit(hingeJoint, "custom")).toEqual({ showComponents: true, send: false });
  });

  it("sends X, Y or Z only when it changes the stored axis", () => {
    expect(axisDirectionEdit(hingeJoint, "x")).toEqual({ showComponents: false, send: true });
    expect(axisDirectionEdit(hingeJoint, "z")).toEqual({ showComponents: false, send: false });
  });
});
