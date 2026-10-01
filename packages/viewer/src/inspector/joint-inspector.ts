import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { JOINT_COORDINATE_UNITS, type Joint, jointTagName } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import { quantityUnitLabel } from "../drives/parameter-units.ts";
import {
  deviceLinkRow,
  type GroupDraft,
  liveRow,
  type PropertyRow,
  row,
} from "../properties/property-rows.ts";
import { sensorsOfJoint } from "../sensors/joint-sensors.ts";
import { withUnit } from "./device-fields.ts";
import type { InspectorContext } from "./inspector-context.ts";

// The inspector of a joint (ADR 0030 point 2): where it is, the fault it can
// be given, the tag to move it when no actuator does, and links to what moves
// and reads it. Its geometry stays in the properties grid of the tree.

function positionRows(joint: Joint, context: InspectorContext): PropertyRow[] {
  const { pantin, faults, t } = context;
  const unit = JOINT_COORDINATE_UNITS[joint.type];
  if (unit === null) {
    return [];
  }
  const assembly = pantin.document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
  const label = withUnit(t("inspector.position"), quantityUnitLabel("position", unit, t));
  const rows = [
    liveRow("position", label, {
      kind: "tag",
      tag: jointTagName(assembly, joint.tagKey, "position"),
      unit,
      format: "number",
    }),
    row("jammed", t("drives.fault.jammed"), "", {
      input: "toggle",
      action: { kind: "jointJammed", jointId: joint.id },
      on: faults.jammedJoints.includes(joint.id),
    }),
  ];
  // An actuator reads the setpoint's place: forcing it by hand would fight it.
  if (actuatorOfJoint(pantin.document, joint.id) === undefined) {
    const setpoint = jointTagName(assembly, joint.tagKey, "setpoint");
    rows.push(
      liveRow(
        "setpoint",
        withUnit(t("inspector.setpoint"), quantityUnitLabel("position", unit, t)),
        { kind: "tag", tag: setpoint, unit, format: "number" },
        { input: "number", tag: setpoint },
      ),
    );
  }
  return rows;
}

function linkRows(joint: Joint, context: InspectorContext): PropertyRow[] {
  const { pantin, language, t } = context;
  const actuator = actuatorOfJoint(pantin.document, joint.id);
  const sensors = sensorsOfJoint(pantin.document, joint.id);
  const actuatorRow =
    actuator === undefined
      ? { ...row("actuator", t("properties.actuator"), t("properties.noActuator")), muted: true }
      : deviceLinkRow(
          "actuator",
          t("properties.actuator"),
          `${actuator.name} · ${ACTUATOR_LABELS[actuator.type][language].name}`,
          { kind: "actuator", id: actuator.id },
        );
  return [
    actuatorRow,
    ...sensors.map((sensor) =>
      deviceLinkRow(
        `sensor-${sensor.id}`,
        t("diagram.kind.sensor"),
        `${sensor.name} · ${SENSOR_LABELS[sensor.type][language].name}`,
        { kind: "sensor", id: sensor.id },
      ),
    ),
  ];
}

export function jointInspectorGroups(joint: Joint, context: InspectorContext): GroupDraft[] {
  const position = positionRows(joint, context);
  // A fixed joint has nothing that moves it or reads it.
  return position.length === 0
    ? []
    : [
        { id: "position", rows: position },
        { id: "links", rows: linkRows(joint, context) },
      ];
}
