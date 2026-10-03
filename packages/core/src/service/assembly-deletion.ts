import type { AssemblyDeletion, AssemblyDeletionResponse, PantinId } from "@pantin/protocol";
import { deleteAssemblyWithContents } from "../domain/assembly-deletion.ts";
import { tidyJoints } from "./actuator-operations.ts";
import { forgetDriveRuntimeState } from "./drive-operations.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import { loadSettledPantin, releaseMesh } from "./mesh-lifecycle.ts";
import { meshPathsOf, type OpenPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Deleting an assembly with its contents (ADR 0037 points 5 and 6).

/** The dry run: the same checks as the deletion, nothing changes. */
export async function previewAssemblyDeletion(
  context: ServiceContext,
  pantinId: PantinId,
  key: string,
): Promise<AssemblyDeletion> {
  const openPantin = await loadSettledPantin(context, pantinId);
  return deleteAssemblyWithContents(openPantin.document, key, openPantin.jointPositions).deletion;
}

// Forgets what the removed items left in memory: a joint or drive created
// later under the same id must start clean. The surviving joints of a removed
// actuator stop, as when its actuator is deleted alone (ADR 0028 point 9).
function forgetRemovedItems(
  context: ServiceContext,
  openPantin: OpenPantin,
  before: OpenPantin["document"],
  deletion: AssemblyDeletion,
): void {
  for (const { id } of deletion.joints) {
    forgetJointRuntimeState(openPantin, id);
  }
  for (const { id } of deletion.drives) {
    forgetDriveRuntimeState(context, openPantin, id);
  }
  for (const { id } of deletion.sensors) {
    openPantin.sensorOutputs.delete(id);
  }
  const removedActuatorIds = new Set(deletion.actuators.map(({ id }) => id));
  for (const actuator of before.actuators.filter(({ id }) => removedActuatorIds.has(id))) {
    tidyJoints(openPantin, actuator.joints, []);
  }
}

// The document change is the commit point and is never undone: a file that
// cannot be deleted stays as an orphan, which the next save retries, and is
// reported. An orphan is the safe direction (ADR 0006), a missing mesh is not.
// The I/O error itself is not logged: the core has no log channel for it (the
// console codes are a closed protocol list, and adding one is a protocol
// change), so the path in `retainedMeshFiles` is what the client gets.
// A path the document uses again, by an import that reserved the same file
// name while the deletion awaited, must stay: it belongs to that body now.
async function releaseMeshes(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
  meshPaths: readonly string[],
): Promise<string[]> {
  const retained: string[] = [];
  for (const meshPath of meshPaths) {
    if (meshPathsOf(openPantin.document).has(meshPath)) {
      continue;
    }
    try {
      await releaseMesh(context, pantinId, openPantin, meshPath);
    } catch {
      openPantin.pendingMeshDeletions.add(meshPath);
      retained.push(meshPath);
    }
  }
  return retained;
}

export async function deleteAssemblyWithContentsOf(
  context: ServiceContext,
  pantinId: PantinId,
  key: string,
): Promise<AssemblyDeletionResponse> {
  const openPantin = await loadSettledPantin(context, pantinId);
  const before = openPantin.document;
  const { document, deletion, meshPaths } = deleteAssemblyWithContents(
    before,
    key,
    openPantin.jointPositions,
  );
  // No await between the checks above and the end of this block: neither a
  // simulation step nor another request sees a half-deleted assembly.
  openPantin.document = document;
  forgetRemovedItems(context, openPantin, before, deletion);
  const retainedMeshFiles = await releaseMeshes(context, pantinId, openPantin, meshPaths);
  return { pantin: toResponse(pantinId, openPantin), deleted: deletion, retainedMeshFiles };
}
