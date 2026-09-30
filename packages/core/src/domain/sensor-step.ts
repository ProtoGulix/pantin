import type { PantinDocument } from "@pantin/protocol";
import { evaluateSensor, type SensorOutput } from "@pantin/sensor-types/evaluators";
import { currentJointPosition } from "./kinematics.ts";

// Sensors at each simulation step (ADR 0025 point 1), as a pure function: each
// sensor reads its joint's position after the joints moved, from the state
// its previous step left. A sensor never stepped starts without history.

/** The output of every sensor, by id, in a fresh map the caller may keep. */
export function stepSensors(
  document: PantinDocument,
  jointPositions: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, SensorOutput>,
): Map<string, SensorOutput> {
  const outputs = new Map<string, SensorOutput>();
  for (const sensor of document.sensors) {
    const joint = document.joints.find((candidate) => candidate.id === sensor.joint);
    if (joint !== undefined) {
      const position = currentJointPosition(joint, jointPositions);
      const state = previous.get(sensor.id)?.state ?? null;
      outputs.set(sensor.id, evaluateSensor({ fields: sensor, position, state }));
    }
  }
  return outputs;
}
