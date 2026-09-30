import { type Joint, type PantinResponse, SENSOR_TAGS, tagName } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import type { Language, Translate } from "../i18n/translate.ts";
import { sensorsOfJoint } from "../sensors/joint-sensors.ts";
import { type GroupDraft, row } from "./property-rows.ts";

// The sensors of a joint, in the joint's properties (ADR 0023): one row per
// sensor watching it, with its type and its tags. Read only: sensors are
// edited in the right-hand panel, opened from the joint's context menu.
export function jointSensorGroup(
  joint: Joint,
  pantin: PantinResponse,
  language: Language,
  t: Translate,
): GroupDraft {
  const sensors = sensorsOfJoint(pantin.document, joint.id);
  if (sensors.length === 0) {
    return {
      id: "sensors",
      rows: [{ ...row("none", t("sensors.title"), t("properties.noSensor")), muted: true }],
    };
  }
  return {
    id: "sensors",
    rows: sensors.map((sensor) => {
      const tags = SENSOR_TAGS[sensor.type].map((tag) =>
        tagName(sensor.assembly, sensor.tagKey, tag.member),
      );
      const type = SENSOR_LABELS[sensor.type][language].name;
      return row(`sensor-${sensor.id}`, sensor.name, `${type} · ${tags.join(", ")}`);
    }),
  };
}
