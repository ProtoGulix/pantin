import type {
  Absorber,
  Belt,
  Emitter,
  Guide,
  Joint,
  PantinDocument,
  Placement,
  PresenceSensor,
} from "@pantin/protocol";
import { assembly, body, documentOf } from "./placed-fixtures.ts";

// Phase 6 objects (ADR 0043) in the default document of placed-fixtures.ts,
// whose "main" assembly holds the bodies "frame" and "carriage".

const IDENTITY: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };

export function belt(fields: Partial<Belt> = {}): Belt {
  return {
    id: "feed",
    name: "Feed belt",
    assembly: "main",
    placement: IDENTITY,
    length: 1,
    width: 0.4,
    drumJoint: "drum",
    drumRadius: 0.05,
    ...fields,
  };
}

export function guide(fields: Partial<Guide> = {}): Guide {
  return {
    id: "rail",
    name: "Rail",
    assembly: "main",
    placement: IDENTITY,
    size: [1, 0.02, 0.1],
    ...fields,
  };
}

export function emitter(fields: Partial<Emitter> = {}): Emitter {
  return {
    id: "source",
    tagKey: "source",
    name: "Source",
    assembly: "main",
    placement: IDENTITY,
    box: { size: [0.3, 0.2, 0.2], mass: 1.5, material: "cardboard" },
    ...fields,
  };
}

export function absorber(fields: Partial<Absorber> = {}): Absorber {
  return {
    id: "sink",
    name: "Sink",
    assembly: "main",
    placement: IDENTITY,
    size: [0.2, 0.4, 0.2],
    ...fields,
  };
}

export function photoelectricCell(fields: Partial<PresenceSensor> = {}): PresenceSensor {
  return {
    id: "cell",
    tagKey: "cell",
    name: "Cell",
    assembly: "main",
    placement: IDENTITY,
    type: "photoelectric",
    mode: "diffuse",
    range: 0.6,
    normallyClosed: false,
    onDelay: 0,
    offDelay: 0,
    ...fields,
    // Partial of a union keyed by `type`, as in placed-fixtures.ts joint().
  } as PresenceSensor;
}

export function drumJoint(): Joint {
  return {
    id: "drum",
    tagKey: "drum",
    name: "drum",
    type: "continuous",
    parent: "frame",
    child: "roller",
    origin: [0, 0, 0],
    axis: [0, 1, 0],
  };
}

/** Two assemblies: "main" with a drum on a "roller" body, and "line" with a body "bench". */
export function conveyorDocument(extra: Partial<PantinDocument> = {}): PantinDocument {
  const base = documentOf(
    [drumJoint()],
    [body("frame", "main"), body("roller", "main"), body("bench", "line")],
    [assembly("main", IDENTITY), assembly("line", IDENTITY)],
  );
  return { ...base, ...extra };
}
