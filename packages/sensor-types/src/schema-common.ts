// What every sensor type's schema.ts uses: shapes of data only, no logic,
// since the protocol imports the schemas (ADR 0023 point 1). Values are SI,
// in the unit of the watched joint's coordinate (metre or radian).

// Seen from the PLC: a sensor only reports, so its tags are feedback.
export interface SensorTag {
  member: string;
  type: "bit" | "integer";
  direction: "feedback";
}

// How clients show and type a parameter: a range of the joint's coordinate
// (mm or degrees), pulses per unit of it (per mm or per turn), or a yes/no.
export type SensorParameterKind = "coordinateRange" | "pulsesPerUnit" | "flag";

export interface SensorParameter {
  field: string;
  kind: SensorParameterKind;
}

export type SensorLanguage = "en" | "fr";

/** The labels of one sensor type, one entry per parameter and per tag member. */
export type SensorTypeLabels<Field extends string, Member extends string> = Readonly<
  Record<
    SensorLanguage,
    {
      name: string;
      parameters: Readonly<Record<Field, string>>;
      tags: Readonly<Record<Member, string>>;
    }
  >
>;
