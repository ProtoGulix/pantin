import { cylinderSwitchDiagram } from "./cylinder-switch/diagram.ts";
import { cylinderSwitchZones } from "./cylinder-switch/zone.ts";
import { inductiveSwitchDiagram } from "./inductive-switch/diagram.ts";
import { inductiveSwitchZones } from "./inductive-switch/zone.ts";
import { limitSwitchDiagram } from "./limit-switch/diagram.ts";
import { limitSwitchZones } from "./limit-switch/zone.ts";
import { positionSwitchDiagram } from "./position-switch/diagram.ts";
import { positionSwitchZones } from "./position-switch/zone.ts";
import type { Stroke } from "./schema-common.ts";
import type { SensorFields, SensorType } from "./schemas.ts";
import type { SwitchDiagram, SwitchZones } from "./switch-zones.ts";

// Registry of switch zones and diagrams (ADR 0025 point 2, ADR 0026):
// geometry, no evaluation, so clients may read it to draw a switch. Both
// depend on the watched joint's stroke. Every type has an entry: a switch (a
// type with a normallyClosed field) must give its zones and its diagram, any
// other type (the encoder) null, since it has its own evaluation. A type
// missing here does not compile.

export type { Direction, Stroke } from "./schema-common.ts";
export type {
  DiagramDimension,
  DiagramSymbol,
  Interval,
  SwitchDiagram,
  SwitchZones,
} from "./switch-zones.ts";

type FieldsOf<Type extends SensorType> = Extract<SensorFields, { type: Type }>;

// A method, not a function type: the lookup below relies on method parameters
// being compared bivariantly, as for the evaluators.
interface ZoneEntry<Fields extends { normallyClosed: boolean }> {
  zones(fields: Fields, stroke: Stroke): SwitchZones;
  diagram(fields: Fields, stroke: Stroke): SwitchDiagram;
}

const SWITCH_ZONES: {
  readonly [Type in SensorType]: FieldsOf<Type> extends { normallyClosed: boolean }
    ? ZoneEntry<FieldsOf<Type>>
    : null;
} = {
  position_switch: { zones: positionSwitchZones, diagram: positionSwitchDiagram },
  limit_switch: { zones: limitSwitchZones, diagram: limitSwitchDiagram },
  cylinder_switch: { zones: cylinderSwitchZones, diagram: cylinderSwitchDiagram },
  inductive_switch: { zones: inductiveSwitchZones, diagram: inductiveSwitchDiagram },
  encoder: null,
};

export interface SwitchOf {
  zones: SwitchZones;
  normallyClosed: boolean;
  // On a joint without end stops the angle is read within one turn (ADR 0026 point 3).
  withinOneTurn: boolean;
}

function switchEntry(fields: SensorFields) {
  const entry: ZoneEntry<SensorFields & { normallyClosed: boolean }> | null =
    SWITCH_ZONES[fields.type];
  return entry === null || !("normallyClosed" in fields) ? null : { entry, fields };
}

/** A switch's zones and output sense on a joint of this stroke; null for a sensor that is not a switch. */
export function switchOf(fields: SensorFields, stroke: Stroke): SwitchOf | null {
  const found = switchEntry(fields);
  if (found === null) {
    return null;
  }
  return {
    zones: found.entry.zones(found.fields, stroke),
    normallyClosed: found.fields.normallyClosed,
    withinOneTurn: stroke === null,
  };
}

/** The zones of a switch; null for a sensor that is not a switch. */
export function switchZonesOf(fields: SensorFields, stroke: Stroke): SwitchZones | null {
  return switchOf(fields, stroke)?.zones ?? null;
}

/** The dimensioned diagram of a switch; null for a sensor that is not a switch. */
export function switchDiagramOf(fields: SensorFields, stroke: Stroke): SwitchDiagram | null {
  const found = switchEntry(fields);
  return found === null ? null : found.entry.diagram(found.fields, stroke);
}
