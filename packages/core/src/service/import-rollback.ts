import type { Assembly, Joint, PantinId } from "@pantin/protocol";
import { removeAssembly, removeBodies, removeJoints } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import { releaseMesh } from "./mesh-lifecycle.ts";
import type { OpenPantin, ServiceContext } from "./open-pantins.ts";

// Undoes a failed import: the joints, the bodies then the assemblies of the
// import leave the document, and its mesh files are deleted.

export type ImportToUndo = {
  openPantin: OpenPantin;
  assemblies: readonly Assembly[];
  bodyIds: ReadonlySet<string>;
  joints: readonly Joint[];
};

// The store refuses to overwrite (exclusive creation) and says so with a
// conflict: that file belongs to someone else and must survive the rollback.
export function isExistingFileConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === "conflict";
}

function removeFromDocument({ openPantin, assemblies, bodyIds, joints }: ImportToUndo): void {
  // Joints first, so that no joint ever points to a missing body.
  const jointIds = new Set(joints.map((joint) => joint.id));
  openPantin.document = removeJoints(openPantin.document, jointIds);
  for (const jointId of jointIds) {
    forgetJointRuntimeState(openPantin, jointId);
  }
  openPantin.document = removeBodies(openPantin.document, bodyIds);
  for (const assembly of [...assemblies].reverse()) {
    openPantin.document = removeAssembly(openPantin.document, assembly.key);
  }
}

// Deleting the mesh through the store would delete its face file too.
async function deleteMeshOnly(
  context: ServiceContext,
  pantinId: PantinId,
  meshPath: string,
): Promise<void> {
  const fileName = meshPath.split("/").at(-1) ?? meshPath;
  await context.store.deleteMeshFolderFile(pantinId, fileName, () => true);
}

// Every deletion is attempted even if one fails (allSettled). A failure goes to
// the server log: the caller rethrows the original error, and the file then
// shows up as an orphan the user can clean (ADR 0038).
export async function rollbackImport(
  context: ServiceContext,
  pantinId: PantinId,
  importToUndo: ImportToUndo,
  meshPaths: readonly string[],
  meshWithForeignFaceFile?: string,
): Promise<void> {
  removeFromDocument(importToUndo);
  const outcomes = await Promise.allSettled(
    meshPaths.map((meshPath) =>
      meshPath === meshWithForeignFaceFile
        ? deleteMeshOnly(context, pantinId, meshPath)
        : releaseMesh(context, pantinId, importToUndo.openPantin, meshPath),
    ),
  );
  outcomes.forEach((outcome, at) => {
    if (outcome.status === "rejected") {
      context.reportError(
        new Error(
          `Import rollback could not delete mesh "${meshPaths[at] ?? ""}" of Pantin "${pantinId}": ${String(outcome.reason)}`,
        ),
      );
    }
  });
}
