import type {
  CreateDriveRequest,
  Drive,
  FaultsResponse,
  PantinDocument,
  PantinId,
  PantinResponse,
  RenamedTagsResponse,
} from "@pantin/protocol";
import {
  addDriveToDocument,
  deleteDriveFromDocument,
  renameDriveTagKey,
  updateDriveInDocument,
} from "../domain/drive-rules.ts";
import { renamedTags } from "../domain/tags.ts";
import { ApiError } from "../errors.ts";
import { waitForImports } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Drives and faults of an open Pantin (ADR 0022). Every drive edit also tidies
// the runtime state, so that nothing stale comes back: a released joint stops,
// a newly driven joint forgets its setpoint, a changed or deleted drive forgets
// its commands, state, feedback and fault.

function forgetDriveRuntimeState(openPantin: OpenPantin, driveId: string): void {
  openPantin.driveCommands.delete(driveId);
  openPantin.driveStates.delete(driveId);
  openPantin.driveFeedback.delete(driveId);
  openPantin.frozenDriveCommands.delete(driveId);
}

function tidyJoints(openPantin: OpenPantin, before: readonly string[], after: readonly string[]) {
  for (const jointId of before.filter((id) => !after.includes(id))) {
    openPantin.jointVelocities.delete(jointId);
  }
  for (const jointId of after.filter((id) => !before.includes(id))) {
    openPantin.setpoints.delete(jointId);
    openPantin.queuedSetpoints.delete(jointId);
  }
}

// An import in flight may still roll back joints or an assembly a drive uses.
async function openSettled(context: ServiceContext, pantinId: PantinId): Promise<OpenPantin> {
  const openPantin = await loadPantin(context, pantinId);
  await waitForImports(openPantin);
  return openPantin;
}

function driveOf(document: PantinDocument, driveId: string): Drive | undefined {
  return document.drives.find((drive) => drive.id === driveId);
}

export function driveOperations(context: ServiceContext) {
  return {
    createDrive: async (pantinId: PantinId, request: CreateDriveRequest): Promise<Drive> => {
      const openPantin = await openSettled(context, pantinId);
      const { document, drive } = addDriveToDocument(openPantin.document, request);
      openPantin.document = document;
      tidyJoints(openPantin, [], drive.joints);
      return drive;
    },
    updateDrive: async (pantinId: PantinId, driveId: string, request: CreateDriveRequest) => {
      const openPantin = await openSettled(context, pantinId);
      const before = driveOf(openPantin.document, driveId);
      const { document, drive } = updateDriveInDocument(openPantin.document, driveId, request);
      openPantin.document = document;
      tidyJoints(openPantin, before?.joints ?? [], drive.joints);
      if (before?.type !== drive.type) {
        forgetDriveRuntimeState(openPantin, driveId);
      }
      return drive;
    },
    deleteDrive: async (pantinId: PantinId, driveId: string): Promise<PantinResponse> => {
      const openPantin = await openSettled(context, pantinId);
      const before = driveOf(openPantin.document, driveId);
      openPantin.document = deleteDriveFromDocument(openPantin.document, driveId);
      tidyJoints(openPantin, before?.joints ?? [], []);
      forgetDriveRuntimeState(openPantin, driveId);
      return toResponse(pantinId, openPantin);
    },
    renameDriveTagKey: async (pantinId: PantinId, driveId: string, tagKey: string) => {
      const openPantin = await openSettled(context, pantinId);
      const before = openPantin.document;
      openPantin.document = renameDriveTagKey(before, driveId, tagKey);
      const answer: RenamedTagsResponse = {
        pantin: toResponse(pantinId, openPantin),
        renamedTags: renamedTags(before, openPantin.document),
      };
      return answer;
    },
    ...faultOperations(context),
  };
}

function faultsOf(openPantin: OpenPantin): FaultsResponse {
  return {
    jammedJoints: [...openPantin.jammedJointIds],
    unresponsiveDrives: [...openPantin.frozenDriveCommands.keys()],
  };
}

// Faults need not wait for imports: a rollback removes its joints through
// forgetJointRuntimeState, which drops their jam, and no drive can use a
// joint or an assembly still reserved by an import (drive edits wait).
function faultOperations(context: ServiceContext) {
  return {
    getFaults: async (pantinId: PantinId) => faultsOf(await loadPantin(context, pantinId)),
    setJointFault: async (pantinId: PantinId, jointId: string, fault: "none" | "jammed") => {
      const openPantin = await loadPantin(context, pantinId);
      if (!openPantin.document.joints.some((joint) => joint.id === jointId)) {
        throw new ApiError("not_found", `Pantin "${pantinId}" has no joint "${jointId}".`);
      }
      if (fault === "jammed") {
        openPantin.jammedJointIds.add(jointId);
        openPantin.jointVelocities.set(jointId, 0);
      } else {
        openPantin.jammedJointIds.delete(jointId);
      }
      return faultsOf(openPantin);
    },
    setDriveFault: async (pantinId: PantinId, driveId: string, fault: "none" | "unresponsive") => {
      const openPantin = await loadPantin(context, pantinId);
      if (driveOf(openPantin.document, driveId) === undefined) {
        throw new ApiError("not_found", `Pantin "${pantinId}" has no drive "${driveId}".`);
      }
      // Frozen once: failing again keeps the commands of the first failure.
      if (fault === "unresponsive" && !openPantin.frozenDriveCommands.has(driveId)) {
        const commands = openPantin.driveCommands.get(driveId) ?? {};
        openPantin.frozenDriveCommands.set(driveId, commands);
      } else if (fault === "none") {
        openPantin.frozenDriveCommands.delete(driveId);
      }
      return faultsOf(openPantin);
    },
  };
}
