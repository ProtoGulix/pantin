import { endpointAssembly, type PantinDocument } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId } from "./ids.ts";

// Who uses each tag key of an assembly: joints through the assembly their child
// moves (ADR 0019, ADR 0055), drives, sensors, emitters and presence sensors through their own
// (ADR 0022, 0023, 0043).
// A key names one owner only, since "<assembly>.<tagKey>" prefixes its tags.

export interface TagKeyOwnerException {
  jointId?: string;
  driveId?: string;
  sensorId?: string;
  emitterId?: string;
  presenceSensorId?: string;
}

/** Tag key to its owner, e.g. `joint "tige"`, in `assembly`, but the excepted owner. */
export function tagKeyOwners(
  document: PantinDocument,
  assembly: string | undefined,
  except: TagKeyOwnerException = {},
): Map<string, string> {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const owners = new Map<string, string>();
  for (const joint of document.joints) {
    if (joint.id !== except.jointId && endpointAssembly(joint.child, assemblyOf) === assembly) {
      owners.set(joint.tagKey, `joint "${joint.id}"`);
    }
  }
  for (const drive of document.drives) {
    if (drive.id !== except.driveId && drive.assembly === assembly) {
      owners.set(drive.tagKey, `drive "${drive.id}"`);
    }
  }
  for (const sensor of document.sensors) {
    if (sensor.id !== except.sensorId && sensor.assembly === assembly) {
      owners.set(sensor.tagKey, `sensor "${sensor.id}"`);
    }
  }
  for (const emitter of document.emitters) {
    if (emitter.id !== except.emitterId && emitter.assembly === assembly) {
      owners.set(emitter.tagKey, `emitter "${emitter.id}"`);
    }
  }
  for (const presenceSensor of document.presenceSensors) {
    if (presenceSensor.id !== except.presenceSensorId && presenceSensor.assembly === assembly) {
      owners.set(presenceSensor.tagKey, `presence sensor "${presenceSensor.id}"`);
    }
  }
  return owners;
}

// A taken key is refused with a free one, so the user can retry at once.
export function keyTaken(key: string, owner: string, takenKeys: ReadonlySet<string>): ApiError {
  const free = makeUniqueId(key, takenKeys);
  return new ApiError("conflict", `Key "${key}" is already used by ${owner}. "${free}" is free.`);
}
