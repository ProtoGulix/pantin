import {
  groupEndpoint,
  type JointEndpoint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { actuatorOf, bodyOf, encoderOf } from "../diagram/diagram-fixtures.ts";

// Small documents for the joint star tests, checked by the protocol schema.

interface JointSpec {
  id: string;
  parent: JointEndpoint;
  child: JointEndpoint;
  type?: string;
}

export interface StarFixture {
  assemblies: string[];
  bodies: [id: string, assembly: string][];
  joints?: JointSpec[];
  // Joint ids moved by an actuator.
  drivenJoints?: string[];
  // Joint ids watched by a sensor.
  watchedJoints?: string[];
}

function jointDocument(spec: JointSpec) {
  const type = spec.type ?? "fixed";
  const limits = type === "prismatic" || type === "revolute" ? { limits: [0, 0.1] } : {};
  return {
    id: spec.id,
    tagKey: spec.id,
    name: spec.id,
    type,
    parent: spec.parent,
    child: spec.child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    ...limits,
  };
}

export function starDocument(fixture: StarFixture): PantinDocument {
  const driven = fixture.drivenJoints ?? [];
  return PantinDocumentSchema.parse({
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: fixture.assemblies.map((key) => ({
      key,
      name: key.toUpperCase(),
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })),
    bodies: fixture.bodies.map(([id, assembly]) => bodyOf(id, assembly)),
    joints: (fixture.joints ?? []).map(jointDocument),
    drives: [],
    actuators:
      driven.length === 0
        ? []
        : [
            actuatorOf(
              "motor",
              fixture.assemblies[0] ?? "a",
              { type: "double_acting_cylinder", extendSpeed: 0.2, retractSpeed: 0.2 },
              null,
              driven,
            ),
          ],
    sensors: (fixture.watchedJoints ?? []).map((jointId) =>
      encoderOf(`encoder-${jointId}`, fixture.assemblies[0] ?? "a", jointId),
    ),
    belts: [],
    guides: [],
    emitters: [],
    absorbers: [],
    presenceSensors: [],
  });
}

/** The shape of `Translateur SCIE.step` (ADR 0059): 10 groups, 51 bodies, 9 fixed joints between groups. */
export function scieFixture(): StarFixture {
  const assemblies = Array.from({ length: 10 }, (_, index) => `g${index}`);
  const bodies: [string, string][] = Array.from({ length: 51 }, (_, index) => [
    `b${String(index).padStart(2, "0")}`,
    `g${index % 10}`,
  ]);
  const joints = assemblies.slice(1).map((key, index) => ({
    id: `weld${index + 1}`,
    parent: groupEndpoint(`g${index}`),
    child: groupEndpoint(key),
  }));
  return { assemblies, bodies, joints };
}
