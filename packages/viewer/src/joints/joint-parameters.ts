import {
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type Joint,
  type JointCoordinateUnit,
  type JointParameter,
  LimitsSchema,
} from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import {
  coordinateToDisplay,
  type DisplayUnit,
  displayUnitOf,
  formatDisplayNumber,
  metresToMillimetres,
} from "../units.ts";
import { parameterLabelKey } from "./joint-labels.ts";

// Reads the type-specific parameters of a joint through JOINT_PARAMETERS, so
// that no code here knows a joint type (ADR 0016).

type ParameterValue =
  // In the unit of the joint's coordinate (metre or radian).
  | { field: string; kind: "coordinateRange"; lower: number; upper: number }
  // In metres.
  | { field: string; kind: "length"; metres: number };

export function coordinateUnitOf(joint: Joint): JointCoordinateUnit {
  return JOINT_COORDINATE_UNITS[joint.type];
}

// The contract lists field names as strings; the value is checked against
// the kind's shape instead of being cast.
function readParameter(joint: Joint, parameter: JointParameter): ParameterValue | null {
  const raw: unknown = Reflect.get(joint, parameter.field);
  if (parameter.kind === "coordinateRange") {
    const limits = LimitsSchema.safeParse(raw);
    return limits.success
      ? {
          field: parameter.field,
          kind: parameter.kind,
          lower: limits.data[0],
          upper: limits.data[1],
        }
      : null;
  }
  return typeof raw === "number"
    ? { field: parameter.field, kind: parameter.kind, metres: raw }
    : null;
}

/** The declared parameters of a joint with their values, in declaration order. */
function parameterValues(joint: Joint): ParameterValue[] {
  return JOINT_PARAMETERS[joint.type].flatMap((parameter) => readParameter(joint, parameter) ?? []);
}

/** Limits of the joint's coordinate, or null when it declares none. */
export function coordinateLimits(joint: Joint): { lower: number; upper: number } | null {
  for (const value of parameterValues(joint)) {
    if (value.kind === "coordinateRange") {
      return { lower: value.lower, upper: value.upper };
    }
  }
  return null;
}

export function displayUnitLabel(unit: DisplayUnit, t: Translate): string {
  return t(unit === "mm" ? "unit.symbol.mm" : "unit.symbol.degree");
}

function displayText(value: ParameterValue, unit: JointCoordinateUnit, t: Translate): string {
  if (value.kind === "length") {
    return `${formatDisplayNumber(metresToMillimetres(value.metres))} ${displayUnitLabel("mm", t)}`;
  }
  const lower = formatDisplayNumber(coordinateToDisplay(unit, value.lower));
  const upper = formatDisplayNumber(coordinateToDisplay(unit, value.upper));
  const symbol = displayUnitOf(unit);
  return `${lower} … ${upper}${symbol === null ? "" : ` ${displayUnitLabel(symbol, t)}`}`;
}

/** Label and value, in display units, of each declared parameter of a joint. */
export function parameterRows(
  joint: Joint,
  t: Translate,
): { field: string; label: string; value: string }[] {
  const unit = coordinateUnitOf(joint);
  return parameterValues(joint).map((value) => ({
    field: value.field,
    label: t(parameterLabelKey(value.field)),
    value: displayText(value, unit, t),
  }));
}
