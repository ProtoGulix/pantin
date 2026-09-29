import { JOINT_PARAMETERS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { initialJointForm, withJointFormType } from "../joints/joint-form.ts";
import { JOINT_TYPES } from "../joints/joint-labels.ts";
import { pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
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

  it("offers every joint type of the protocol and the bodies of the Pantin", () => {
    const view = buildJointFormView(stateWith(JOINT_TYPES[0] ?? "fixed"), translate);
    expect(view?.typeOptions.map((option) => option.value)).toEqual([...JOINT_TYPES]);
    expect(view?.bodyOptions).toEqual([
      { value: "rail", label: "Linear rail" },
      { value: "carriage", label: "N_1" },
    ]);
  });

  it("always has the origin in mm and the unitless axis first", () => {
    const view = buildJointFormView(stateWith(JOINT_TYPES[0] ?? "fixed"), translate);
    expect(view?.rows.slice(0, 2).map((row) => [row.label, row.unit, row.inputs.length])).toEqual([
      ["Origin", "mm", 3],
      ["Axis", null, 3],
    ]);
  });

  it.each(JOINT_TYPES)("adds exactly the rows %s declares", (type) => {
    const view = buildJointFormView(stateWith(type), translate);
    const parameterRows = view?.rows.slice(2) ?? [];
    expect(parameterRows.length).toBe(JOINT_PARAMETERS[type].length);
    for (const row of parameterRows) {
      expect(row.label).not.toBe("");
      expect(row.inputs.length).toBeGreaterThan(0);
    }
  });

  it("gives a range the unit of the coordinate and a length millimetres", () => {
    for (const type of JOINT_TYPES) {
      const rows = buildJointFormView(stateWith(type), translate)?.rows.slice(2) ?? [];
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
