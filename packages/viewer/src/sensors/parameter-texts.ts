import type { JointCoordinateUnit, SensorParameter } from "@pantin/protocol";
import { parseNumber } from "../joints/joint-form.ts";
import { coordinateFromDisplay, coordinateToDisplay, formatDisplayNumber } from "../units.ts";

// A sensor parameter as the texts of its form inputs, and back (ADR 0023,
// ADR 0025 point 4). Each kind of parameter has its inputs, by key: a range
// has "<field>.lower" and "<field>.upper", the others "<field>". Values are
// SI; texts are in the joint's display unit (mm or degrees).

/** The input keys of one parameter, in the order the form shows them. */
export function parameterKeys(parameter: SensorParameter): string[] {
  return parameter.kind === "coordinateRange"
    ? [`${parameter.field}.lower`, `${parameter.field}.upper`]
    : [parameter.field];
}

// Pulses per metre or radian from pulses per mm or degree, and back: the
// inverse of a coordinate conversion.
const perUnitFromDisplay = (unit: JointCoordinateUnit, value: number) =>
  value / coordinateFromDisplay(unit, 1);
const perUnitToDisplay = (unit: JointCoordinateUnit, value: number) =>
  value * coordinateFromDisplay(unit, 1);

const numberText = (stored: unknown, convert: (value: number) => number) =>
  typeof stored === "number" ? formatDisplayNumber(convert(stored)) : "";

/** The texts of a stored value, one per input key. */
export function parameterTexts(
  parameter: SensorParameter,
  stored: unknown,
  unit: JointCoordinateUnit,
): string[] {
  const toDisplay = (value: number) => coordinateToDisplay(unit, value);
  switch (parameter.kind) {
    case "flag":
      return [String(stored === true)];
    case "choice":
      return [typeof stored === "string" ? stored : ""];
    case "percent":
      return [numberText(stored, (value) => value)];
    case "pulsesPerUnit":
      return [numberText(stored, (value) => perUnitToDisplay(unit, value))];
    case "coordinate":
      return [numberText(stored, toDisplay)];
    case "coordinateRange":
      return Array.isArray(stored) ? stored.map((value) => numberText(value, toDisplay)) : [];
  }
}

/** The SI value of a parameter from the texts of its inputs, unvalidated. */
export function parameterValue(
  parameter: SensorParameter,
  texts: Readonly<Record<string, string>>,
  unit: JointCoordinateUnit,
): unknown {
  const [first = "", second = ""] = parameterKeys(parameter).map((key) => texts[key] ?? "");
  switch (parameter.kind) {
    case "flag":
      return first === "true";
    case "choice":
      return first;
    case "percent":
      return parseNumber(first);
    case "pulsesPerUnit":
      return perUnitFromDisplay(unit, parseNumber(first));
    case "coordinate":
      return coordinateFromDisplay(unit, parseNumber(first));
    case "coordinateRange":
      return [first, second].map((text) => coordinateFromDisplay(unit, parseNumber(text)));
  }
}

// A new form shows what it will send: flags unset, choices on their first option.
export function defaultTexts(parameter: SensorParameter): Record<string, string> {
  if (parameter.kind === "flag") {
    return { [parameter.field]: "false" };
  }
  const first = parameter.options?.[0];
  return parameter.kind === "choice" && first !== undefined ? { [parameter.field]: first } : {};
}
