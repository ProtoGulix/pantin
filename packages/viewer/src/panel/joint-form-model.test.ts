import { bodyEndpoint, JOINT_PARAMETERS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { jointFormFor } from "../joints/joint-edit-form.ts";
import {
  initialJointForm,
  withJointAxisDirection,
  withJointFormType,
} from "../joints/joint-form.ts";
import { JOINT_TYPES } from "../joints/joint-labels.ts";
import { pantinResponse, railBody, slideJoint, stepBody, weldJoint } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildJointFormView } from "./joint-form-model.ts";

const translate = createTranslator("en");
const bodies = [railBody, stepBody("carriage", "N_1")];

function stateWith(type: (typeof JOINT_TYPES)[number]) {
  const opened = withOpenPantin(initialViewerState("en"), pantinResponse(false, bodies));
  return { ...opened, jointForm: withJointFormType(initialJointForm(bodies), type) };
}

describe("buildJointFormView", () => {
  it("is null while the form is closed", () => {
    const opened = withOpenPantin(initialViewerState("en"), pantinResponse(false, bodies));
    expect(buildJointFormView(opened, translate)).toBeNull();
  });

  it("offers every joint type of the protocol and the bodies and groups of the Pantin", () => {
    const view = buildJointFormView(stateWith(JOINT_TYPES[0] ?? "fixed"), translate);
    expect(view?.typeOptions.map((option) => option.value)).toEqual([...JOINT_TYPES]);
    expect(view?.bodyOptions).toEqual([
      { value: "rail", label: "Linear rail" },
      { value: "carriage", label: "N_1" },
      // The assemblies follow, as groups a joint can hang (ADR 0055).
      { value: "assembly:main", label: "Group: main" },
    ]);
  });

  it("always has the origin in mm and the axis as a choice of direction", () => {
    const view = buildJointFormView(stateWith(JOINT_TYPES[0] ?? "fixed"), translate);
    expect([view?.origin.label, view?.origin.unit, view?.origin.inputs.length]).toEqual([
      'Origin (frame of "main")',
      "mm",
      3,
    ]);
    expect(view?.axis.choice).toEqual({ direction: "z", reversed: false });
    expect(view?.axis.options.map((option) => option.value)).toEqual(["x", "y", "z", "custom"]);
    expect(view?.axis.components).toBeNull();
    expect(view?.axis.reversed).toEqual({ label: "Reversed", checked: false });
  });

  it.each(JOINT_TYPES)("adds exactly the rows %s declares", (type) => {
    const view = buildJointFormView(stateWith(type), translate);
    const parameterRows = view?.rows ?? [];
    expect(parameterRows.length).toBe(JOINT_PARAMETERS[type].length);
    for (const row of parameterRows) {
      expect(row.label).not.toBe("");
      expect(row.inputs.length).toBeGreaterThan(0);
    }
  });

  it("gives a range the unit of the coordinate and a length millimetres", () => {
    for (const type of JOINT_TYPES) {
      const rows = buildJointFormView(stateWith(type), translate)?.rows ?? [];
      JOINT_PARAMETERS[type].forEach((parameter, index) => {
        const unit = rows[index]?.unit;
        expect(parameter.kind === "length" ? unit === "mm" : unit === "mm" || unit === "°").toBe(
          true,
        );
      });
    }
  });

  it("disables the button while a request runs", () => {
    const busy = { ...stateWith(JOINT_TYPES[0] ?? "fixed"), pendingRequestCount: 1 };
    expect(buildJointFormView(busy, translate)?.canSubmit).toBe(false);
  });
});

describe("buildJointFormView, axis buttons and frame (ADR 0041, 0042)", () => {
  it("names the parent body's assembly in the axis and origin labels", () => {
    const view = buildJointFormView(stateWith("prismatic"), translate);
    expect(view?.axis.label).toBe('Axis (frame of "main")');
    expect(view?.origin.label).toBe('Origin (frame of "main")');
  });

  it("offers Reverse always, and the face pick on a stored joint that moves", () => {
    expect(buildJointFormView(stateWith("prismatic"), translate)?.axis.fromFace).toBeNull();
    const opened = withOpenPantin(initialViewerState("en"), pantinResponse(false, bodies));
    const stored = {
      ...opened,
      jointForm: jointFormFor({ ...slideJoint, parent: bodyEndpoint("rail") }),
    };
    const view = buildJointFormView(stored, translate);
    expect(view?.axis.invertLabel).toBe("Reverse the axis");
    expect(view?.axis.fromFace).toEqual({ label: "Take the axis from a face", waiting: false });
    const fromFixed = {
      ...opened,
      jointForm: withJointFormType(jointFormFor(weldJoint), "prismatic"),
    };
    expect(buildJointFormView(fromFixed, translate)?.axis.fromFace).not.toBeNull();
    const waiting = {
      ...stored,
      axisPick: {
        pantinId: "press",
        jointId: "slide",
        nodeId: null,
        waiting: true,
        highlight: null,
      },
    };
    expect(buildJointFormView(waiting, translate)?.axis.fromFace?.waiting).toBe(true);
  });
});

describe("buildJointFormView, axis", () => {
  it("shows the three unitless axis components for a custom direction", () => {
    const state = stateWith(JOINT_TYPES[0] ?? "fixed");
    const custom = {
      ...state,
      jointForm: withJointAxisDirection(initialJointForm(bodies), "custom"),
    };
    const components = buildJointFormView(custom, translate)?.axis.components;
    expect([components?.unit, components?.inputs.length]).toEqual([null, 3]);
    expect(buildJointFormView(custom, translate)?.axis.reversed).toBeNull();
  });
});

describe("buildJointFormView, type change", () => {
  it("titles the form after the joint it changes (ADR 0018)", () => {
    const opened = withOpenPantin(initialViewerState("en"), pantinResponse(false, bodies));
    const withJoint = {
      ...opened,
      openPantin: opened.openPantin && {
        ...opened.openPantin,
        document: { ...opened.openPantin.document, joints: [weldJoint] },
      },
    };
    const view = buildJointFormView(
      { ...withJoint, jointForm: jointFormFor(weldJoint) },
      translate,
    );
    expect([view?.title, view?.confirmLabel]).toEqual(['Change joint "Weld"', "Apply"]);
  });
});
