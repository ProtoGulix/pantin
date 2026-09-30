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
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Drives and faults of an open Pantin (ADR 0022, 0028). Every drive edit also
// tidies the runtime state, so that nothing stale comes back: a changed or
// deleted drive forgets its commands, state, port states, feedback and fault.

function forgetDriveRuntimeState(openPantin: OpenPantin, driveId: string): void {
  openPantin.driveCommands.delete(driveId);
  openPantin.driveStates.delete(driveId);
  openPantin.drivePortStates.delete(driveId);
  openPantin.driveFeedback.delete(driveId);
  openPantin.driveDiagnostics.delete(driveId);
  openPantin.unresponsiveDriveIds.delete(driveId);
}

function driveOf(document: PantinDocument, driveId: string): Drive | undefined {
  return document.drives.find((drive) => drive.id === driveId);
}

export function driveOperations(context: ServiceContext) {
  return {
    createDrive: async (pantinId: PantinId, request: CreateDriveRequest): Promise<Drive> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const { document, drive } = addDriveToDocument(openPantin.document, request);
      openPantin.document = document;
      return drive;
    },
    updateDrive: async (pantinId: PantinId, driveId: string, request: CreateDriveRequest) => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const before = driveOf(openPantin.document, driveId);
      const { document, drive } = updateDriveInDocument(openPantin.document, driveId, request);
      openPantin.document = document;
      if (before?.type !== drive.type) {
        forgetDriveRuntimeState(openPantin, driveId);
      }
      return drive;
    },
    deleteDrive: async (pantinId: PantinId, driveId: string): Promise<PantinResponse> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      openPantin.document = deleteDriveFromDocument(openPantin.document, driveId);
      forgetDriveRuntimeState(openPantin, driveId);
      return toResponse(pantinId, openPantin);
    },
    renameDriveTagKey: async (pantinId: PantinId, driveId: string, tagKey: string) => {
      const openPantin = await loadSettledPantin(context, pantinId);
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
    unresponsiveDrives: [...openPantin.unresponsiveDriveIds],
  };
}

// Faults need not wait for imports: a rollback removes its joints through
// forgetJointRuntimeState, which drops their jam, and no actuator can use a
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
      if (fault === "unresponsive") {
        openPantin.unresponsiveDriveIds.add(driveId);
      } else {
        openPantin.unresponsiveDriveIds.delete(driveId);
      }
      return faultsOf(openPantin);
    },
  };
}
