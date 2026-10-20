import { actuatorOfJoint, movableJoints } from "../actuators/actuator-joints.ts";
import type { AssemblyDisplay } from "../assembly-display.ts";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import { ownerOfDevice } from "../io/io-owner.ts";
import { menuContext } from "../menu/menu-context.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { endSwitchRequests } from "../sensors/joint-sensors.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import { buildTree, findNode } from "../tree/tree-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// Entries of the tree's right-click menu, as data.

export type ContextAction =
  | "rename"
  | "frame"
  | "importInto"
  | "newAssembly"
  | "newJoint"
  | "group"
  | "ungroup"
  | "deleteRedundantJoints"
  | "changeJointType"
  | "actuateJoint"
  | "addJointSensor"
  | "addEndSwitches"
  | "toggleAssemblyHidden"
  | "toggleAssemblyIsolated"
  | "delete"
  // The actions of the inspector toolbar, on a device row (ADR 0047 point 5).
  | "editDevice"
  | "deleteDevice"
  // The I/O view on the device's tags (ADR 0049 point 11).
  | "showInIo";

export interface ContextMenuView {
  nodeId: string;
  title: string;
  x: number;
  y: number;
  entries: { action: ContextAction; label: string }[];
}

/**
 * Entries depend on the node: only Pantins accept an import or a new
 * assembly, assemblies and the "between assemblies" folder a new joint, only
 * joints a type change, bodies, joints and assemblies a deletion. An
 * assembly can also be hidden or isolated in the 3D view. A device row offers
 * what the inspector toolbar offers: edit and delete.
 */
export function contextEntries(ref: NodeRef, renamable: boolean): ContextAction[] {
  if (ref.kind === "device") {
    // Rename stays in the inspector, and a device has nothing to frame.
    return ["editDevice", "showInIo", "deleteDevice"];
  }
  const entries: ContextAction[] = renamable ? ["rename"] : [];
  entries.push("frame");
  if (ref.kind === "pantin") {
    entries.push("importInto", "newAssembly", "deleteRedundantJoints");
  }
  if (ref.kind === "assembly" || ref.kind === "folder") {
    entries.push("newJoint");
  }
  if (ref.kind === "body" || ref.kind === "assembly") {
    // Offered when the selected rows can be grouped, or the group dissolved (isOffered).
    entries.push("group");
  }
  if (ref.kind === "assembly") {
    entries.push("ungroup", "toggleAssemblyHidden", "toggleAssemblyIsolated");
  }
  if (ref.kind === "joint") {
    entries.push("changeJointType", "actuateJoint", "addJointSensor", "addEndSwitches");
  }
  if (ref.kind === "body" || ref.kind === "joint" || ref.kind === "assembly") {
    entries.push("delete");
  }
  return entries;
}

const CONTEXT_LABELS = {
  rename: "menu.rename",
  frame: "menu.frame",
  importInto: "menu.importInto",
  newAssembly: "menu.newAssembly",
  newJoint: "menu.newJoint",
  group: "menu.group",
  ungroup: "menu.ungroup",
  deleteRedundantJoints: "menu.deleteRedundantJoints",
  changeJointType: "menu.changeJointType",
  actuateJoint: "menu.addJointActuator",
  addJointSensor: "menu.addJointSensor",
  addEndSwitches: "menu.addEndSwitches",
  toggleAssemblyHidden: "menu.hideAssembly",
  toggleAssemblyIsolated: "menu.isolateAssembly",
  delete: "menu.delete",
  editDevice: "drives.edit",
  deleteDevice: "drives.delete",
  showInIo: "menu.showInIo",
} as const;

const JOINT_WIRING: readonly ContextAction[] = ["actuateJoint", "addJointSensor", "addEndSwitches"];

// A fixed joint gets no actuator nor sensor entry (ADR 0028, ADR 0023), and a
// joint without limits (continuous) no end-of-stroke switches.
function isOffered(action: ContextAction, ref: NodeRef, state: ViewerState): boolean {
  if (action === "showInIo") {
    // Only an element that can own tags has something to show there.
    return ref.kind === "device" && ownerOfDevice({ kind: ref.deviceKind, id: ref.id }) !== null;
  }
  if (action === "group" || action === "ungroup") {
    return isGroupingOffered(action, state);
  }
  if (action === "deleteRedundantJoints") {
    const context = menuContext(state);
    return context.editing && !context.busy && !context.importing;
  }
  if (!JOINT_WIRING.includes(action) || ref.kind !== "joint") {
    return true;
  }
  const document = state.openPantin?.document;
  if (document === undefined) {
    return false;
  }
  return action === "addEndSwitches"
    ? endSwitchRequests(document, ref.jointId).length > 0
    : movableJoints(document).some((joint) => joint.id === ref.jointId);
}

// The context menu acts on the selection: a right click keeps it when the row
// is part of it, and selects the row otherwise. Dégrouper acts on the first
// selected row only, so it is offered on that row.
function isGroupingOffered(action: "group" | "ungroup", state: ViewerState): boolean {
  const context = menuContext(state);
  return action === "group"
    ? context.canGroup
    : context.canUngroup && selectedNodeIdOf(state.selection) === state.contextMenu?.nodeId;
}

function isActuated(ref: NodeRef, state: ViewerState): boolean {
  const document = state.openPantin?.document;
  return (
    ref.kind === "joint" &&
    document !== undefined &&
    actuatorOfJoint(document, ref.jointId) !== undefined
  );
}

// The visibility entries say what they will do: show a hidden assembly, or
// show every assembly again once one is isolated.
function labelKeyOf(
  action: ContextAction,
  ref: NodeRef,
  display: AssemblyDisplay,
  hidden: boolean,
): MessageKey {
  if (ref.kind === "assembly" && action === "toggleAssemblyHidden") {
    return hidden ? "menu.showAssembly" : "menu.hideAssembly";
  }
  if (ref.kind === "assembly" && action === "toggleAssemblyIsolated") {
    return display.isolatedAssemblyKey === ref.key
      ? "menu.showAllAssemblies"
      : "menu.isolateAssembly";
  }
  return CONTEXT_LABELS[action];
}

export function buildContextMenuView(state: ViewerState, t: Translate): ContextMenuView | null {
  const menu = state.contextMenu;
  const node = menu === null ? null : findNode(buildTree(state, t), menu.nodeId);
  const ref = menu === null ? null : parseNodeId(menu.nodeId);
  if (menu === null || node === null || ref === null) {
    return null;
  }
  return {
    nodeId: node.id,
    title: t("menu.label", { name: node.label }),
    x: menu.x,
    y: menu.y,
    entries: contextEntries(ref, node.renamable)
      .filter((action) => isOffered(action, ref, state))
      .map((action) => ({
        action,
        label: t(
          action === "actuateJoint" && isActuated(ref, state)
            ? "menu.editJointActuator"
            : labelKeyOf(action, ref, state.assemblyDisplay, node.visibility === "hidden"),
        ),
      })),
  };
}
