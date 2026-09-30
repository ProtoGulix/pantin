import type { Drive, PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { buildDrivePanelView } from "../panel/drive-panel-model.ts";
import { hingeJoint, pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  buildDriveRequest,
  driveFormFor,
  initialDriveForm,
  withDriveFormJoint,
  withDriveFormType,
  withDriveFormValue,
} from "./drive-form.ts";
import { driveTagUnit } from "./drive-tags.ts";

// The drives panel (ADR 0022): its form, in display units, and its view.

const valve: Drive = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "main",
  joints: ["slide"],
  type: "double_acting_cylinder",
  speed: 0.2,
};

const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
  hingeJoint,
]);
const document: PantinDocument = { ...response.document, drives: [valve] };

describe("drive form", () => {
  it("builds the SI request from a speed typed in mm/s", () => {
    let form = withDriveFormJoint(initialDriveForm(document), "slide", true);
    form = withDriveFormValue({ ...form, name: "Valve" }, "speed", "200");
    expect(buildDriveRequest(form, document)).toEqual({
      ok: true,
      request: {
        type: "double_acting_cylinder",
        name: "Valve",
        assembly: "main",
        joints: ["slide"],
        speed: 0.2,
      },
    });
  });

  it("types a pivot's speed in degrees per second", () => {
    let form = withDriveFormJoint(initialDriveForm(document), "hinge", true);
    form = withDriveFormValue({ ...form, name: "Arm" }, "speed", "180");
    const built = buildDriveRequest(form, document);
    expect(built.ok && Reflect.get(built.request, "speed")).toBeCloseTo(Math.PI);
  });

  it("prefills a drive in display units, and empties parameters on a type change", () => {
    const form = driveFormFor(valve, document);
    expect([form.driveId, form.joints, form.values]).toEqual([
      "valve",
      ["slide"],
      { speed: "200" },
    ]);
    expect(withDriveFormType(form, "servo_axis").values).toEqual({});
  });

  it("reports the schema's message instead of a request", () => {
    expect(buildDriveRequest(initialDriveForm(document), document).ok).toBe(false);
  });
});

describe("drive panel view", () => {
  const opened = withOpenPantin(initialViewerState("fr"), { ...response, document });
  const translate = createTranslator("fr");

  it("is open from the start, closes on demand, and lists each drive with its tags and joints", () => {
    expect(buildDrivePanelView({ ...opened, drivePanelOpen: false }, translate).open).toBe(false);
    const view = buildDrivePanelView(opened, translate);
    expect(view.open).toBe(true);
    const [card] = view.drives;
    expect(card).toMatchObject({
      name: "Valve",
      typeLabel: "Vérin double effet",
      tagPrefix: "main.valve",
    });
    expect(card?.tags.map(({ name, control }) => [name, control])).toEqual([
      ["main.valve.extend", "bit"],
      ["main.valve.retract", "bit"],
    ]);
    expect(card?.joints).toEqual([
      {
        id: "slide",
        name: "Slide",
        positionTag: "main.slide.position",
        unit: "mm",
        coordinateUnit: "metre",
        jammed: false,
      },
    ]);
  });

  it("shows faults and the form with the type's own parameters and units", () => {
    const faults = { jammedJoints: ["slide"], unresponsiveDrives: ["valve"] };
    const driveForm = driveFormFor(valve, document);
    const view = buildDrivePanelView(
      { ...opened, drivePanelOpen: true, faults, driveForm },
      translate,
    );
    expect([view.drives[0]?.unresponsive, view.drives[0]?.joints[0]?.jammed]).toEqual([true, true]);
    expect(view.form?.parameters).toEqual([
      { field: "speed", label: "Vitesse", unit: "mm/s", value: "200" },
    ]);
  });
});

describe("driveTagUnit", () => {
  it("gives a drive tag the unit of its joints, and nothing for other names", () => {
    expect(driveTagUnit(document, "main.valve.extend")).toBe("metre");
    expect(driveTagUnit(document, "main.slide.position")).toBeNull();
  });
});
