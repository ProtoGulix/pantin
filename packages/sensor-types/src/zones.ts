import { cylinderSwitchZones } from "./cylinder-switch/zone.ts";
import { inductiveSwitchZones } from "./inductive-switch/zone.ts";
import { limitSwitchZones } from "./limit-switch/zone.ts";
import { positionSwitchZones } from "./position-switch/zone.ts";
import type { SensorFields, SensorType } from "./schemas.ts";
import type { SwitchZones } from "./switch-zones.ts";

// Registry of switch zones (ADR 0025 point 2): geometry, no evaluation, so
// clients may read it to draw a switch. Every type has an entry: a switch
// (a type with a normallyClosed field) must give its zones, any other type
// (the encoder) null, since it has its own evaluation. A type missing here
// does not compile.

export type { Interval, SwitchZones } from "./switch-zones.ts";

type FieldsOf<Type extends SensorType> = Extract<SensorFields, { type: Type }>;

// A method, not a function type: the lookup below relies on method parameters
// being compared bivariantly, as for the evaluators.
interface ZoneEntry<Fields extends { normallyClosed: boolean }> {
  zones(fields: Fields): SwitchZones;
}

const SWITCH_ZONES: {
  readonly [Type in SensorType]: FieldsOf<Type> extends { normallyClosed: boolean }
    ? ZoneEntry<FieldsOf<Type>>
    : null;
} = {
  position_switch: { zones: positionSwitchZones },
  limit_switch: { zones: limitSwitchZones },
  cylinder_switch: { zones: cylinderSwitchZones },
  inductive_switch: { zones: inductiveSwitchZones },
  encoder: null,
};

export interface SwitchOf {
  zones: SwitchZones;
  normallyClosed: boolean;
}

/** A switch's zones and output sense; null for a sensor that is not a switch. */
export function switchOf(fields: SensorFields): SwitchOf | null {
  const entry: ZoneEntry<SensorFields & { normallyClosed: boolean }> | null =
    SWITCH_ZONES[fields.type];
  if (entry === null || !("normallyClosed" in fields)) {
    return null;
  }
  return { zones: entry.zones(fields), normallyClosed: fields.normallyClosed };
}

/** The zones of a switch; null for a sensor that is not a switch. */
export function switchZonesOf(fields: SensorFields): SwitchZones | null {
  return switchOf(fields)?.zones ?? null;
}
