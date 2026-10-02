import { describe, expect, it } from "vitest";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import type { PropertyGroup, PropertyRow } from "../properties/property-rows.ts";
import { withNode } from "../test-fixtures.ts";
import { assemblyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildInspectorView } from "./inspector-model.ts";

// The inspector for each kind of selection (ADR 0030 point 2); the properties
// of tree nodes are in node-inspector.test.ts.

const t = createTranslator("fr");

// Assembly a: a valve feeding a cylinder that moves j1, an encoder on j1.
// Assembly b: a drive with a parameter, and j2, which no actuator moves.
const document = documentOf({
  assemblies: ["a", "b"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "b"), bodyOf("s3", "b")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2"), jointOf("j3", "s3", "fixed")],
  drives: [driveOf("v1", "a"), { ...driveOf("inv", "b", "vfd_analog"), acceleration: 50 }],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
  sensors: [encoderOf("e1", "a", "j1")],
});
const pantin = { id: "press", unsavedChanges: false, document };
const opened = withOpenPantin(initialViewerState("fr"), pantin);

const inspectorOf = (state: ViewerState) => buildInspectorView(state, t);
const selecting = (nodeId: string) => inspectorOf(withNode(opened, nodeId));
const device = (kind: "drive" | "actuator" | "sensor", id: string) =>
  inspectorOf(withSelection(opened, { kind, id }));
const rowsOf = (groups: PropertyGroup[], id: string): PropertyRow[] =>
  groups.find((group) => group.id === id)?.rows ?? [];

describe("inspector of a drive", () => {
  const view = device("drive", "v1");

  it("names it, and edits its name in place", () => {
    expect(view.subject).toBe("Préactionneur · v1");
    const [name, type, prefix] = rowsOf(view.groups, "general");
    expect([name?.value, name?.edit]).toEqual([
      "v1",
      {
        input: "text",
        target: { kind: "deviceField", device: { kind: "drive", id: "v1" }, fieldId: "name" },
      },
    ]);
    expect([type?.value, prefix?.value]).toEqual(["Distributeur 5/2, bistable", "a.v1"]);
  });

  it("forces each bit command with a toggle on its tag, with its live value", () => {
    const [coil14] = rowsOf(view.groups, "commands");
    expect(coil14?.label).toBe("Bobine 14");
    expect(coil14?.edit).toEqual({
      input: "toggle",
      action: { kind: "bitTag", tag: "a.v1.coil_14" },
      on: false,
    });
    expect(coil14?.live).toEqual({ kind: "tag", tag: "a.v1.coil_14", unit: null, format: "bit" });
    expect(view.live.get("commands/coil_14")).toEqual(coil14?.live);
  });
});

describe("inspector of a drive, faults and parameters", () => {
  it("has no group for what the type does not have", () => {
    const view = device("drive", "v1");
    expect(view.groups.map((group) => group.id)).toEqual(["general", "commands", "faults"]);
  });

  it("offers the unresponsive fault from the core's state, and the diagnostics line", () => {
    const faults = { jammedJoints: [], unresponsiveDrives: ["v1"] };
    const faulty = inspectorOf({
      ...withSelection(opened, { kind: "drive", id: "v1" }),
      faults,
    });
    const [unresponsive, diagnostics] = rowsOf(faulty.groups, "faults");
    expect(unresponsive?.edit).toEqual({
      input: "toggle",
      action: { kind: "driveUnresponsive", driveId: "v1" },
      on: true,
    });
    expect(diagnostics?.live).toEqual({
      kind: "diagnostics",
      driveId: "v1",
      driveType: "valve_5_2_double",
    });
  });

  it("edits a parameter in place in its display unit, and sends a float command", () => {
    const inverter = device("drive", "inv");
    const [acceleration] = rowsOf(inverter.groups, "parameters");
    expect([acceleration?.label, acceleration?.value]).toEqual(["Accélération (%/s)", "50"]);
    expect(acceleration?.edit).toMatchObject({ target: { fieldId: "acceleration" } });
    const [setpoint] = rowsOf(inverter.groups, "commands");
    expect(setpoint?.edit).toEqual({ input: "number", tag: "b.inv.speed_setpoint" });
    expect(rowsOf(inverter.groups, "feedback")[0]?.live).toMatchObject({
      tag: "b.inv.speed",
      format: "number",
    });
  });
});

describe("inspector of an actuator", () => {
  it("shows its fields and parameters, not its feed nor its joints", () => {
    const view = device("actuator", "c1");
    expect(view.groups.map((group) => group.id)).toEqual(["general", "parameters"]);
    expect(rowsOf(view.groups, "general").map((row) => [row.label, row.value])).toEqual([
      ["Nom", "c1"],
      ["Type", "Vérin double effet"],
    ]);
    expect(rowsOf(view.groups, "parameters").map((row) => [row.label, row.value])).toEqual([
      ["Vitesse de sortie (mm/s)", "200"],
      ["Vitesse de rentrée (mm/s)", "200"],
    ]);
  });
});

describe("inspector of a sensor", () => {
  it("shows its fields, its parameters and its state, live", () => {
    const view = device("sensor", "e1");
    expect(view.groups.map((group) => group.id)).toEqual(["general", "parameters", "state"]);
    expect(rowsOf(view.groups, "parameters")[0]?.edit).toMatchObject({
      input: "text",
      target: {
        kind: "deviceField",
        device: { kind: "sensor", id: "e1" },
        fieldId: "pulsesPerUnit",
      },
    });
    expect(rowsOf(view.groups, "state")[0]?.live).toEqual({
      kind: "tag",
      tag: "a.e1.count",
      unit: null,
      format: "number",
    });
  });
});

describe("inspector of a joint", () => {
  it("shows its live position and the jammed toggle, and links to its actuator and sensors", () => {
    const faults = { jammedJoints: ["j1"], unresponsiveDrives: [] };
    const view = inspectorOf({ ...withNode(opened, jointNodeId("press", "j1")), faults });
    const [position, jammed] = rowsOf(view.groups, "position");
    expect([position?.label, position?.live]).toEqual([
      "Position (mm)",
      { kind: "tag", tag: "a.j1.position", unit: "metre", format: "number" },
    ]);
    expect(jammed?.edit).toEqual({
      input: "toggle",
      action: { kind: "jointJammed", jointId: "j1" },
      on: true,
    });
    // An actuator moves it: its setpoint is not offered.
    expect(rowsOf(view.groups, "position")).toHaveLength(2);
    expect(rowsOf(view.groups, "links").map((row) => [row.value, row.link])).toEqual([
      ["c1 · Vérin double effet", { kind: "device", device: { kind: "actuator", id: "c1" } }],
      ["e1 · Codeur", { kind: "device", device: { kind: "sensor", id: "e1" } }],
    ]);
  });

  it("offers its setpoint, in mm, when no actuator moves it", () => {
    const view = selecting(jointNodeId("press", "j2"));
    const setpoint = rowsOf(view.groups, "position")[2];
    expect([setpoint?.label, setpoint?.edit]).toEqual([
      "Consigne (mm)",
      { input: "number", tag: "b.j2.setpoint" },
    ]);
    expect(rowsOf(view.groups, "links")[0]?.muted).toBe(true);
  });

  it("has no live group for a fixed joint, only its properties", () => {
    const view = selecting(jointNodeId("press", "j3"));
    expect(view.groups.map((group) => group.id)).toEqual(["general", "placement"]);
    expect(view.note).toBeNull();
  });
});

describe("index of the Pantin and of an assembly", () => {
  const index = selecting(pantinNodeId("press"));

  it("lists every device with its name and type, and a line selects its device", () => {
    expect(index.groups.map((group) => group.id)).toEqual([
      "general",
      "driveIndex",
      "actuatorIndex",
      "sensorIndex",
    ]);
    expect(
      rowsOf(index.groups, "driveIndex").map((row) => [row.label, row.value, row.link]),
    ).toEqual([
      ["v1", "Distributeur 5/2, bistable", { kind: "device", device: { kind: "drive", id: "v1" } }],
      [
        "inv",
        "Variateur, consigne analogique",
        { kind: "device", device: { kind: "drive", id: "inv" } },
      ],
    ]);
    expect(rowsOf(index.groups, "actuatorIndex")[0]?.link).toEqual({
      kind: "device",
      device: { kind: "actuator", id: "c1" },
    });
  });

  it("gives a drive its lit commands and a sensor its state as live cells", () => {
    expect(rowsOf(index.groups, "driveIndex")[0]?.live).toMatchObject({
      kind: "driveStatus",
      driveId: "v1",
      commands: [
        { tag: "a.v1.coil_14", label: "Bobine 14" },
        { tag: "a.v1.coil_12", label: "Bobine 12" },
      ],
    });
    expect(rowsOf(index.groups, "sensorIndex")[0]?.live).toMatchObject({ tag: "a.e1.count" });
    expect(index.live.has("sensorIndex/e1")).toBe(true);
  });

  it("limits an assembly's index to its own devices", () => {
    const view = selecting(assemblyNodeId("press", "b"));
    expect(view.groups.map((group) => group.id)).toEqual([
      "general",
      "assemblyPlacement",
      "driveIndex",
    ]);
    expect(rowsOf(view.groups, "driveIndex").map((row) => row.label)).toEqual(["inv"]);
  });
});

describe("hints of an index without devices", () => {
  const index = selecting(pantinNodeId("press"));

  it("says what each family without device is for, in a compact line", () => {
    expect(index.hints).toEqual([]);
    const onlyB = withNode(opened, assemblyNodeId("press", "b"));
    expect(inspectorOf(onlyB).hints).toEqual([t("actuators.empty"), t("sensors.empty")]);
    const empty = withOpenPantin(initialViewerState("fr"), {
      ...pantin,
      document: { ...document, drives: [], actuators: [], sensors: [] },
    });
    const view = inspectorOf(empty);
    expect(view.hints).toEqual([t("drives.empty"), t("actuators.empty"), t("sensors.empty")]);
    expect(view.note).toBeNull();
  });

  it("keeps the collapsed state of a group by id", () => {
    const folded = inspectorOf({
      ...withNode(opened, pantinNodeId("press")),
      collapsedPropertyGroups: new Set(["driveIndex"]),
    });
    expect(folded.groups.map((group) => group.collapsed)).toEqual([false, true, false, false]);
  });
});

describe("inspector without anything to show", () => {
  it("shows a note and the buttons when nothing is selected", () => {
    const view = inspectorOf({ ...opened, selection: null });
    expect(view.groups).toEqual([]);
    expect(view.note).toBe(t("inspector.empty"));
    expect([view.open, view.canCreateActuator, view.canCreateSensor]).toEqual([true, true, true]);
  });

  it("names the tag prefix of a sensor", () => {
    const sensor = device("sensor", "e1");
    expect(rowsOf(sensor.groups, "general")[2]?.value).toBe("a.e1");
  });

  it("disables the actuator and sensor buttons without a joint that moves", () => {
    const bare = withOpenPantin(initialViewerState("fr"), {
      ...pantin,
      document: { ...document, joints: [], actuators: [], sensors: [] },
    });
    const view = inspectorOf(bare);
    expect([view.canCreateActuator, view.canCreateSensor]).toEqual([false, false]);
  });

  it("is closed on demand and when no Pantin is open", () => {
    expect(inspectorOf({ ...opened, inspectorOpen: false }).open).toBe(false);
    expect(inspectorOf(initialViewerState("fr")).open).toBe(false);
  });

  it("shows the form being filled", () => {
    const view = inspectorOf({
      ...opened,
      driveForm: { driveId: null, type: "vfd_analog", name: "", assembly: "a", values: {} },
    });
    expect(view.driveForm?.title).toBe("Nouveau préactionneur");
    expect(view.actuatorForm).toBeNull();
  });
});
