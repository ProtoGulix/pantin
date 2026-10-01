import type { Actuator, Drive, PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { buildDriveFormView } from "../panel/drive-form-model.ts";
import { hingeJoint, pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  buildDriveRequest,
  driveFormFor,
  initialDriveForm,
  withDriveFormType,
  withDriveFormValue,
} from "./drive-form.ts";
import { driveTagUnit, forcedTagUnit } from "./drive-tags.ts";

// The drive form of the inspector (ADR 0022, 0028): in display
// units, and its view; and the units of forced tags.

const inverter: Drive = {
  id: "inverter",
  tagKey: "inverter",
  name: "Inverter",
  assembly: "main",
  type: "vfd_analog",
  acceleration: 50,
};
const servo: Drive = {
  id: "servo",
  tagKey: "servo",
  name: "Servo",
  assembly: "main",
  type: "servo_drive",
  maxSpeed: 0.2,
  maxAcceleration: 1,
};
const slider: Actuator = {
  id: "slider",
  name: "Slider",
  assembly: "main",
  type: "servo_motor",
  feed: { drive: "servo", ports: { in: "out" } },
  joints: ["slide"],
};

const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
  hingeJoint,
]);
const document: PantinDocument = {
  ...response.document,
  drives: [inverter, servo],
  actuators: [slider],
};

describe("drive form", () => {
  it("sends a ramp in percent per second as typed", () => {
    const form = withDriveFormType(
      { ...initialDriveForm(document), name: "Inverter" },
      "vfd_on_off",
    );
    expect(buildDriveRequest(withDriveFormValue(form, "acceleration", "50"), document)).toEqual({
      ok: true,
      request: { type: "vfd_on_off", name: "Inverter", assembly: "main", acceleration: 50 },
    });
  });

  it("types a servo drive's speed in the unit of the joints it ends up moving", () => {
    const form = driveFormFor(servo, document);
    expect(form.values).toEqual({ maxSpeed: "200", maxAcceleration: "1000" });
    const rotary: PantinDocument = {
      ...document,
      actuators: [{ ...slider, joints: ["hinge"] }],
    };
    const built = buildDriveRequest(
      { ...form, values: { maxSpeed: "180", maxAcceleration: "90" } },
      rotary,
    );
    expect(built.ok && Reflect.get(built.request, "maxSpeed")).toBeCloseTo(Math.PI);
  });

  it("prefills a drive, and empties parameters on a type change", () => {
    const form = driveFormFor(inverter, document);
    expect([form.driveId, form.values]).toEqual(["inverter", { acceleration: "50" }]);
    expect(withDriveFormType(form, "servo_drive").values).toEqual({});
  });

  it("reports the schema's message instead of a request", () => {
    expect(buildDriveRequest(initialDriveForm(document), document).ok).toBe(false);
  });
});

describe("drive form view", () => {
  const opened = withOpenPantin(initialViewerState("fr"), { ...response, document });
  const translate = createTranslator("fr");

  it("is empty until a form is open, then has the type's own parameters and units", () => {
    expect(buildDriveFormView(opened, document, translate)).toBeNull();
    const driveForm = driveFormFor(inverter, document);
    const view = buildDriveFormView({ ...opened, driveForm }, document, translate);
    expect(view?.parameters).toEqual([
      { field: "acceleration", label: "Accélération", unit: "%/s", value: "50" },
    ]);
  });
});

describe("driveTagUnit", () => {
  it("gives a coordinate tag the unit of the joints, a percent none, and other names none", () => {
    expect(driveTagUnit(document, "main.servo.setpoint")).toBe("metre");
    expect(driveTagUnit(document, "main.inverter.speed_setpoint")).toBeNull();
    expect(driveTagUnit(document, "main.slide.position")).toBeNull();
  });

  it("gives a joint's setpoint the unit of its coordinate when a tag is forced", () => {
    expect(forcedTagUnit(document, "main.slide.setpoint")).toBe("metre");
    expect(forcedTagUnit(document, "main.servo.setpoint")).toBe("metre");
    expect(forcedTagUnit(document, "main.slide.position")).toBeNull();
  });
});

describe("servo drive unit hint", () => {
  const translate = createTranslator("fr");
  const hint = (doc: PantinDocument, drive: Drive) =>
    buildDriveFormView(
      {
        ...withOpenPantin(initialViewerState("fr"), { ...response, document: doc }),
        driveForm: driveFormFor(drive, doc),
      },
      doc,
      translate,
    )?.unitHint;

  it("announces the fallback unit until an actuator moves a joint, and only for joint units", () => {
    expect(hint({ ...document, actuators: [] }, servo)).toMatch(/mm/);
    expect(hint(document, servo)).toBeNull();
    expect(hint(document, inverter)).toBeNull();
  });
});
