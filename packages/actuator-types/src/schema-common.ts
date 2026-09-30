import type { PortDomain } from "@pantin/drive-types/ports";
import { z } from "zod";

// What every actuator type's schema.ts uses: shapes of data only, no logic,
// since the protocol imports the schemas (ADR 0028 point 3). Float values are
// SI in the unit of the moved joints' coordinate (metre or radian).

/**
 * A rate (speed): finite and strictly positive. Mirrors positiveRate of
 * @pantin/drive-types, whose schema-common.ts this package may not import
 * (only ports.ts is allowed, ADR 0028 point 3).
 */
export function positiveRate(what: string) {
  return z
    .number()
    .refine(Number.isFinite, `The ${what} must be a finite number.`)
    .refine((value) => value > 0, `The ${what} must be greater than zero.`);
}

/** A named input port of an actuator type, and the domain of what it reads. */
export interface ActuatorInputPort {
  name: string;
  domain: PortDomain;
}

/**
 * The default feed on creation, as data for the core and the viewer: for each
 * input port, the output port names to look for on a drive, most preferred
 * first; the first one the chosen drive has is used. `cap` ← `port_4` then
 * `port_2` reads "port_4 of a 5/x, port_2 of a 3/2" without naming drive
 * types, which this package does not know.
 */
export type DefaultFeed = Readonly<Record<string, readonly string[]>>;

// "speed" is per second, "acceleration" per second squared, of the joints'
// coordinate unit; clients show them in mm or degrees.
type ActuatorParameterKind = "speed" | "acceleration";

export interface ActuatorParameter {
  field: string;
  kind: ActuatorParameterKind;
}

export type ActuatorLanguage = "en" | "fr";

/** The labels of one actuator type, one entry per parameter and per input port. */
export type ActuatorTypeLabels<Field extends string, Port extends string> = Readonly<
  Record<
    ActuatorLanguage,
    {
      name: string;
      parameters: Readonly<Record<Field, string>>;
      ports: Readonly<Record<Port, string>>;
    }
  >
>;
