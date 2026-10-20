import type { AssemblyDeletion, AssemblyDeletionResponse } from "@pantin/protocol";
import { withAssemblyRemoved } from "./assembly-display.ts";
import { fieldToEndpoint } from "./joints/joint-endpoint-field.ts";
import { FIELD_CHILD, FIELD_PARENT } from "./joints/joint-form.ts";
import { infoMessage } from "./messages.ts";
import { withPreviousPlacementDropped } from "./previous-placement.ts";
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
    !deleted.descendantAssemblies.some(({ key }) => key === session.assemblyKey) &&
    !session.picks.some((pick) => pick !== null && bodies.has(pick.highlight.bodyId))
  );
}

// A joint form end is a body id or a group, both of which may be among the deleted.
function endpointIsDeleted(
  fieldValue: string,
  bodyIds: ReadonlySet<string>,
  assemblyKeys: ReadonlySet<string>,
): boolean {
  const endpoint = fieldToEndpoint(fieldValue);
  return endpoint.kind === "body" ? bodyIds.has(endpoint.id) : assemblyKeys.has(endpoint.key);
}

// A form whose target went, or that was creating something in the assembly
// or between its bodies, would only be refused by the core: close it.
function withFormsClosed(state: ViewerState, deleted: AssemblyDeletion): ViewerState {
  const keys = new Set([
    deleted.assembly.key,
    ...deleted.descendantAssemblies.map(({ key }) => key),
  ]);
  const bodies = ids(deleted.bodies);
  const { jointForm, driveForm, actuatorForm, sensorForm } = state;
  const jointGone =
    jointForm !== null &&
    (ids(deleted.joints).has(jointForm.jointId ?? "") ||
      endpointIsDeleted(jointForm.values[FIELD_PARENT] ?? "", bodies, keys) ||
      endpointIsDeleted(jointForm.values[FIELD_CHILD] ?? "", bodies, keys));
  return {
    ...state,
    jointForm: jointGone ? null : jointForm,
    driveForm:
      driveForm !== null &&
      (keys.has(driveForm.assembly) || ids(deleted.drives).has(driveForm.driveId ?? ""))
        ? null
        : driveForm,
    actuatorForm:
      actuatorForm !== null &&
      (keys.has(actuatorForm.assembly) || ids(deleted.actuators).has(actuatorForm.actuatorId ?? ""))
        ? null
        : actuatorForm,
    sensorForm:
      sensorForm !== null &&
      (keys.has(sensorForm.assembly) || ids(deleted.sensors).has(sensorForm.sensorId ?? ""))
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
      pendingRedundantJoints: null,
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
  const removedKeys = [deleted.assembly.key, ...deleted.descendantAssemblies.map(({ key }) => key)];
  return {
    ...withFormsClosed(
      withPreviousPlacementDropped(
        withSelection(shown, nodeSelection(pantinNodeId(pantin.id))),
        removedKeys,
      ),
      deleted,
    ),
    assemblyDisplay: withAssemblyRemoved(shown.assemblyDisplay, removedKeys),
    alignment: alignmentOutlives(shown, deleted) ? shown.alignment : null,
    message,
  };
}
