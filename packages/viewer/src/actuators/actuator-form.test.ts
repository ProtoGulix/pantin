import { type Actuator, DriveSchema, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { buildActuatorSectionView } from "../panel/actuator-panel-model.ts";
import { hingeJoint, pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { defaultFeedPorts, drivesFeeding } from "./actuator-feed.ts";
import {
  actuatorFormFor,
  buildActuatorRequest,
  initialActuatorForm,
  selectableJoints,
  withActuatorFormDrive,
  withActuatorFormJoint,
  withActuatorFormPort,
  withActuatorFormType,
  withActuatorFormValue,
} from "./actuator-form.ts";

// The actuator form and section (ADR 0028 point 13): feed, joints, units.

// Parsed by the protocol schema, so each fixture is a valid drive.
const drive = (id: string, fields: Record<string, unknown>) =>
  DriveSchema.parse({ id, tagKey: id, name: id, assembly: "main", ...fields });
const valve = drive("valve", { type: "valve_5_3_closed" });
const smallValve = drive("small", { type: "valve_3_2_single" });
const inverter = drive("inverter", { type: "vfd_analog", acceleration: 50 });

const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
  hingeJoint,
]);
const document: PantinDocument = {
  ...response.document,
  drives: [smallValve, valve, inverter],
};

const cylinder: Actuator = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "main",
  type: "double_acting_cylinder",
  extendSpeed: 0.2,
  retractSpeed: 0.3,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["slide"],
};
const withCylinder: PantinDocument = { ...document, actuators: [cylinder] };

const translate = createTranslator("fr");
const opened = withOpenPantin(initialViewerState("fr"), { ...response, document: withCylinder });

describe("which drives can feed a type", () => {
  it("offers only drives whose output ports cover every input port", () => {
    expect(drivesFeeding(document, "double_acting_cylinder").map(({ id }) => id)).toEqual([
      "valve",
    ]);
    expect(drivesFeeding(document, "single_acting_cylinder").map(({ id }) => id)).toEqual([
      "small",
      "valve",
    ]);
    expect(drivesFeeding(document, "ac_motor").map(({ id }) => id)).toEqual(["inverter"]);
  });

  it("pre-fills the feed from the preferences, the first port the drive has", () => {
    expect(defaultFeedPorts("double_acting_cylinder", "valve_5_3_closed")).toEqual({
      cap: "port_4",
      rod: "port_2",
    });
    expect(defaultFeedPorts("single_acting_cylinder", "valve_3_2_single")).toEqual({
      cap: "port_2",
    });
    expect(defaultFeedPorts("single_acting_cylinder", "valve_5_3_closed")).toEqual({
      cap: "port_4",
    });
    expect(defaultFeedPorts("double_acting_cylinder", "valve_3_2_single")).toBeNull();
  });
});

describe("actuator form", () => {
  it("starts on the first type with the first fitting drive and its default feed", () => {
    const form = initialActuatorForm(document);
    expect([form.type, form.driveId, form.ports]).toEqual([
      "double_acting_cylinder",
      "valve",
      { cap: "port_4", rod: "port_2" },
    ]);
  });

  it("changes the feed with the type, and lets a port be swapped", () => {
    const motor = withActuatorFormType(initialActuatorForm(document), "ac_motor", document);
    expect([motor.driveId, motor.ports]).toEqual(["inverter", { in: "out" }]);
    const cylinder = withActuatorFormType(motor, "double_acting_cylinder", document);
    const swapped = withActuatorFormPort(cylinder, "cap", "port_2");
    // Taking a port another input reads swaps the two: never the same port twice.
    expect(swapped.ports).toEqual({ cap: "port_2", rod: "port_4" });
    expect(withActuatorFormPort(swapped, "rod", "port_2").ports).toEqual({
      cap: "port_4",
      rod: "port_2",
    });
    expect(withActuatorFormDrive(cylinder, null, document)).toMatchObject({
      driveId: null,
      ports: {},
    });
  });
});

describe("actuator request", () => {
  it("builds the SI request with its feed, speeds typed in mm/s", () => {
    let form = { ...initialActuatorForm(document), name: "Cylinder" };
    form = withActuatorFormJoint(form, "slide", true);
    form = withActuatorFormValue(
      withActuatorFormValue(form, "extendSpeed", "200"),
      "retractSpeed",
      "300",
    );
    expect(buildActuatorRequest(form, document)).toEqual({
      ok: true,
      request: {
        type: "double_acting_cylinder",
        name: "Cylinder",
        assembly: "main",
        joints: ["slide"],
        feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
        extendSpeed: 0.2,
        retractSpeed: 0.3,
      },
    });
  });

  it("types a pivot's speed in degrees per second, and sends no feed without a drive", () => {
    let form = withActuatorFormType(initialActuatorForm(document), "ac_motor", document);
    form = withActuatorFormJoint({ ...form, name: "Arm" }, "hinge", true);
    form = withActuatorFormValue(
      withActuatorFormDrive(form, null, document),
      "nominalSpeed",
      "180",
    );
    const built = buildActuatorRequest(form, document);
    expect(built.ok && Reflect.get(built.request, "nominalSpeed")).toBeCloseTo(Math.PI);
    expect(built.ok && "feed" in built.request).toBe(false);
  });

  it("reports the schema's message instead of a request", () => {
    expect(buildActuatorRequest(initialActuatorForm(document), document).ok).toBe(false);
  });
});

describe("joints an actuator offers", () => {
  const other: Actuator = {
    id: "other",
    name: "Other",
    assembly: "main",
    type: "servo_motor",
    joints: ["slide"],
  };
  const busy: PantinDocument = { ...document, actuators: [other] };

  it("hides joints moved by another actuator, and joints of another unit once one is chosen", () => {
    const form = initialActuatorForm(busy);
    expect(selectableJoints(busy, form).map(({ id }) => id)).toEqual(["hinge"]);
    expect(selectableJoints(document, form).map(({ id }) => id)).toEqual(["slide", "hinge"]);
    const chosen = withActuatorFormJoint(form, "slide", true);
    expect(selectableJoints(document, chosen).map(({ id }) => id)).toEqual(["slide"]);
  });

  it("keeps the joints of the actuator being edited", () => {
    const form = actuatorFormFor(other, busy);
    expect(selectableJoints(busy, form).map(({ id }) => id)).toEqual(["slide"]);
  });
});

describe("actuator section view", () => {
  it("shows each actuator with its type, its feed and its joints", () => {
    const view = buildActuatorSectionView(opened, withCylinder, translate);
    expect(view.title).toBe("Actionneurs");
    expect(view.actuators[0]).toMatchObject({
      typeLabel: "Vérin double effet",
      feed: {
        driveName: "valve",
        pairs: [
          { input: "Chambre fond (sortie)", output: "port_4" },
          { input: "Chambre tige (rentrée)", output: "port_2" },
        ],
      },
      joints: [{ id: "slide", positionTag: "main.slide.position", unit: "mm", jammed: false }],
    });
  });
});

describe("actuator form view", () => {
  it("flags a jammed joint, and the form lists fitting drives and each port's choices", () => {
    const faults = { jammedJoints: ["slide"], unresponsiveDrives: [] };
    const actuatorForm = actuatorFormFor(cylinder, withCylinder);
    const view = buildActuatorSectionView(
      { ...opened, faults, actuatorForm },
      withCylinder,
      translate,
    );
    expect(view.actuators[0]?.joints[0]?.jammed).toBe(true);
    expect(view.form?.driveOptions.map(({ value }) => value)).toEqual(["", "valve"]);
    expect(
      view.form?.ports.map(({ name, value, options }) => [name, value, options.length]),
    ).toEqual([
      ["cap", "port_4", 2],
      ["rod", "port_2", 2],
    ]);
    expect(view.form?.parameters.map(({ unit, value }) => [unit, value])).toEqual([
      ["mm/s", "200"],
      ["mm/s", "300"],
    ]);
  });

  it("tells when no drive fits the type", () => {
    const bare: PantinDocument = { ...withCylinder, drives: [smallValve] };
    const actuatorForm = initialActuatorForm(bare);
    const view = buildActuatorSectionView({ ...opened, actuatorForm }, bare, translate);
    expect([view.form?.noFittingDrive, view.form?.drive]).toEqual([true, ""]);
  });
});
