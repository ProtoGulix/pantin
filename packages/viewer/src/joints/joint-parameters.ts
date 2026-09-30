import {
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type Joint,
  type JointCoordinateUnit,
  type JointParameter,
  LimitsSchema,
} from "@pantin/protocol";
import type { Stroke } from "@pantin/sensor-types/zones";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import {
  coordinateToDisplay,
  type DisplayUnit,
  displayUnitOf,
  formatDisplayNumber,
  metresToMillimetres,
} from "../units.ts";
import type { ParameterPart } from "./joint-form.ts";
import { parameterLabelKey } from "./joint-labels.ts";

// Reads the type-specific parameters of a joint through JOINT_PARAMETERS, so
// that no code here knows a joint type (ADR 0016).

export type ParameterValue =
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
export function parameterValues(joint: Joint): ParameterValue[] {
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

/** The joint's limits as the sensors' stroke (metre or radian); null for a joint without limits. */
export function strokeOf(joint: Joint): Stroke {
  const limits = coordinateLimits(joint);
  return limits === null ? null : [limits.lower, limits.upper];
}

export function displayUnitLabel(unit: DisplayUnit, t: Translate): string {
  return t(unit === "mm" ? "unit.symbol.mm" : "unit.symbol.degree");
}

function unitSuffix(symbol: DisplayUnit | null, t: Translate): string {
  return symbol === null ? "" : ` (${displayUnitLabel(symbol, t)})`;
}

export interface ParameterRow {
  // The form's input id ("limits.lower"), also the id of the edit target.
  inputId: string;
  label: string;
  // Display units, no unit symbol: the label carries it.
  value: string;
}

const PART_LABELS: Readonly<Record<Exclude<ParameterPart, "value">, MessageKey>> = {
  lower: "properties.part.lower",
  upper: "properties.part.upper",
};

function rowsOf(value: ParameterValue, unit: JointCoordinateUnit, t: Translate): ParameterRow[] {
  const label = t(parameterLabelKey(value.field));
  if (value.kind === "length") {
    return [
      {
        inputId: `${value.field}.value`,
        label: `${label}${unitSuffix("mm", t)}`,
        value: formatDisplayNumber(metresToMillimetres(value.metres)),
      },
    ];
  }
  const suffix = unitSuffix(displayUnitOf(unit), t);
  const bounds: readonly { part: "lower" | "upper"; number: number }[] = [
    { part: "lower", number: value.lower },
    { part: "upper", number: value.upper },
  ];
  return bounds.map(({ part, number }) => ({
    inputId: `${value.field}.${part}`,
    label: `${label}, ${t(PART_LABELS[part])}${suffix}`,
    value: formatDisplayNumber(coordinateToDisplay(unit, number)),
  }));
}

/** One row per editable input of each declared parameter, in display units. */
export function parameterRows(joint: Joint, t: Translate): ParameterRow[] {
  const unit = coordinateUnitOf(joint);
  return parameterValues(joint).flatMap((value) => rowsOf(value, unit, t));
}
