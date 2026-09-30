import type {
  ACTUATOR_PARAMETERS,
  ActuatorType,
  DriveParameterKind,
  DriveTag,
  JointCoordinateUnit,
} from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { displayUnitLabel } from "../joints/joint-parameters.ts";
import { displayUnitOf } from "../units.ts";

// What unit a drive or actuator value is shown in (ADR 0028 point 6). A value
// either follows the coordinate unit of the joints (metre or radian, shown in
// mm or degrees, per second or per second squared) or is shown as it arrives
// (a percent of a motor's nominal speed). Both tables are Records over the
// protocol's kinds, so a new kind does not compile until it is placed here.

type ActuatorParameterKind = (typeof ACTUATOR_PARAMETERS)[ActuatorType][number]["kind"];
type ParameterKind = DriveParameterKind | ActuatorParameterKind;
type TagQuantity = NonNullable<DriveTag["quantity"]>;

type Scale =
  // Follows the joints' unit; `rate` is appended to its label ("/s").
  { follows: "joints"; rate: string } | { follows: "nothing"; label: string };

const PARAMETER_SCALES: Readonly<Record<ParameterKind, Scale>> = {
  speed: { follows: "joints", rate: "/s" },
  acceleration: { follows: "joints", rate: "/s²" },
  percent_per_second: { follows: "nothing", label: "%/s" },
};

const QUANTITY_SCALES: Readonly<Record<TagQuantity, Scale>> = {
  position: { follows: "joints", rate: "" },
  speed: { follows: "joints", rate: "/s" },
  percent: { follows: "nothing", label: "%" },
};

function conversionUnit(scale: Scale, unit: JointCoordinateUnit): JointCoordinateUnit {
  return scale.follows === "joints" ? unit : null;
}

function unitLabel(scale: Scale, unit: JointCoordinateUnit, t: Translate): string | null {
  if (scale.follows === "nothing") {
    return scale.label;
  }
  const display = displayUnitOf(unit);
  return display === null ? null : `${displayUnitLabel(display, t)}${scale.rate}`;
}

/** The unit to convert a parameter with; null when it is shown as stored. */
export function parameterConversionUnit(
  kind: ParameterKind,
  unit: JointCoordinateUnit,
): JointCoordinateUnit {
  return conversionUnit(PARAMETER_SCALES[kind], unit);
}

export function parameterUnitLabel(
  kind: ParameterKind,
  unit: JointCoordinateUnit,
  t: Translate,
): string | null {
  return unitLabel(PARAMETER_SCALES[kind], unit, t);
}

/** The unit to convert a float tag with; null when it is shown as stored. */
export function quantityConversionUnit(
  quantity: TagQuantity | undefined,
  unit: JointCoordinateUnit,
): JointCoordinateUnit {
  return quantity === undefined ? null : conversionUnit(QUANTITY_SCALES[quantity], unit);
}

export function quantityUnitLabel(
  quantity: TagQuantity | undefined,
  unit: JointCoordinateUnit,
  t: Translate,
): string | null {
  return quantity === undefined ? null : unitLabel(QUANTITY_SCALES[quantity], unit, t);
}
