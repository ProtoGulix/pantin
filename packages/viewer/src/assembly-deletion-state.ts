import type { AssemblyDeletion, AssemblyDeletionResponse } from "@pantin/protocol";
import { withAssemblyRemoved } from "./assembly-display.ts";
import { FIELD_CHILD, FIELD_PARENT } from "./joints/joint-form.ts";
import { infoMessage } from "./messages.ts";
import { nodeSelection } from "./selection.ts";
import { pantinNodeId } from "./tree/node-ids.ts";
import { withSelection } from "./tree/tree-state.ts";
import { type ViewerState, withOpenPantin } from "./viewer-state.ts";

// What the viewer drops when the core deleted an assembly with its contents
// (ADR 0037 point 7): display state and edit sessions that pointed at it.

function ids(items: readonly { id: string }[]): Set<string> {
  return new Set(items.map(({ id }) => id));
}

// An alignment moves one assembly and picks faces of bodies: either one gone ends it.
function alignmentOutlives(state: ViewerState, deleted: AssemblyDeletion): boolean {
  const session = state.alignment;
  if (session === null) {
    return false;
  }
  const bodies = ids(deleted.bodies);
  return (
    session.assemblyKey !== deleted.assembly.key &&
    !session.picks.some((pick) => pick !== null && bodies.has(pick.highlight.bodyId))
  );
}

// A form whose target went, or that was creating something in the assembly
// or between its bodies, would only be refused by the core: close it.
function withFormsClosed(state: ViewerState, deleted: AssemblyDeletion): ViewerState {
  const { key } = deleted.assembly;
  const bodies = ids(deleted.bodies);
  const { jointForm, driveForm, actuatorForm, sensorForm } = state;
  const jointGone =
    jointForm !== null &&
    (ids(deleted.joints).has(jointForm.jointId ?? "") ||
      bodies.has(jointForm.values[FIELD_PARENT] ?? "") ||
      bodies.has(jointForm.values[FIELD_CHILD] ?? ""));
  return {
    ...state,
    jointForm: jointGone ? null : jointForm,
    driveForm:
      driveForm !== null &&
      (driveForm.assembly === key || ids(deleted.drives).has(driveForm.driveId ?? ""))
        ? null
        : driveForm,
    actuatorForm:
      actuatorForm !== null &&
      (actuatorForm.assembly === key || ids(deleted.actuators).has(actuatorForm.actuatorId ?? ""))
        ? null
        : actuatorForm,
    sensorForm:
      sensorForm !== null &&
      (sensorForm.assembly === key || ids(deleted.sensors).has(sensorForm.sensorId ?? ""))
        ? null
        : sensorForm,
  };
}

/** The core answered the deletion with contents: show the Pantin, select it, forget the rest. */
export function withAssemblyContentsDeleted(
  state: ViewerState,
  response: AssemblyDeletionResponse,
): ViewerState {
  const { deleted, pantin, retainedMeshFiles } = response;
  const shown = withOpenPantin(
    {
      ...state,
      pendingDeleteAssembly: null,
      pendingOrphanCleanup: null,
      pendingDeleteBodyId: null,
      pendingDeleteJointId: null,
    },
    pantin,
  );
  const message =
    retainedMeshFiles.length === 0
      ? infoMessage("message.assemblyContentsDeleted", { name: deleted.assembly.name })
      : {
          ...infoMessage("message.assemblyContentsDeletedRetained", {
            name: deleted.assembly.name,
            count: retainedMeshFiles.length,
          }),
          detail: retainedMeshFiles.join(", "),
        };
  return {
    ...withFormsClosed(withSelection(shown, nodeSelection(pantinNodeId(pantin.id))), deleted),
    assemblyDisplay: withAssemblyRemoved(shown.assemblyDisplay, deleted.assembly.key),
    alignment: alignmentOutlives(shown, deleted) ? shown.alignment : null,
    message,
  };
}
