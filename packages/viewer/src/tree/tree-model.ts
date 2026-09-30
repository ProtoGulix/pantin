import type { Assembly, Body, Joint, PantinResponse } from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import {
  type AssemblyDisplay,
  isAssemblyHidden,
  NO_ASSEMBLY_DISPLAY,
} from "../assembly-display.ts";
import { pluralKey, type Translate } from "../i18n/translate.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { sensorsOfJoint } from "../sensors/joint-sensors.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  type NodeRef,
  pantinNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";

// The tree of the left panel as plain data: first the full tree of nodes,
// then the flat list of visible rows the DOM draws. Pure, so it is tested
// without a browser.

export type TreeIcon =
  | "pantin"
  | "assembly"
  | "folder"
  | "body-glb"
  | "body-stl"
  | "body-step"
  | "joint"
  | "source-node";

interface JointWiring {
  // Its actuator, if any: a joint has one at most.
  actuatorId: string | null;
  // The sensors watching it, in document order.
  sensorIds: readonly string[];
}

export interface TreeNode {
  id: string;
  kind: NodeRef["kind"];
  icon: TreeIcon;
  label: string;
  // Secondary text after the label (a count, a path), or null.
  detail: string | null;
  // Read-only data from the source file: drawn greyed.
  muted: boolean;
  renamable: boolean;
  // Only assemblies can be hidden in the 3D view: an eye button, not text.
  visibility: "shown" | "hidden" | null;
  // A joint an actuator moves or a sensor watches: a bolt or a sensor mark at the
  // end of its row, like the eye (ADR 0022, ADR 0023); null for other nodes.
  wiring: JointWiring | null;
  // What an icon says (an assembly hidden, a joint driven or watched), for screen readers
  // and as a tooltip; null when there is nothing to say.
  stateLabel: string | null;
  children: readonly TreeNode[];
}

export interface TreeSource {
  openPantin: PantinResponse | null;
  // Absent means every assembly is shown.
  assemblyDisplay?: AssemblyDisplay;
}

function sourceNodeChildren(pantinId: string, body: Body, translate: Translate): TreeNode[] {
  return body.source.nodes.map((node, index) => ({
    id: sourceNodeNodeId(pantinId, body.id, index),
    kind: "sourceNode",
    icon: "source-node",
    label: node.name === "" ? translate("tree.unnamedNode") : node.name,
    detail: node.path.join("/"),
    muted: true,
    renamable: false,
    visibility: null,
    wiring: null,
    stateLabel: null,
    children: [],
  }));
}

// The joints holding a body, listed under it before the CAD nodes; the
// detail says whether the body is the joint's parent or its child.
function bodyJointChildren(pantin: PantinResponse, body: Body, translate: Translate): TreeNode[] {
  return pantin.document.joints.flatMap((joint): TreeNode[] => {
    if (joint.parent !== body.id && joint.child !== body.id) {
      return [];
    }
    const role = joint.child === body.id ? "tree.jointRole.child" : "tree.jointRole.parent";
    return [
      {
        ...jointNode(pantin, joint, translate),
        id: jointNodeId(pantin.id, joint.id, body.id),
        detail: translate(role, { type: translate(jointTypeLabelKey(joint.type)) }),
      },
    ];
  });
}

function bodyNode(pantin: PantinResponse, body: Body, translate: Translate): TreeNode {
  return {
    id: bodyNodeId(pantin.id, body.id),
    kind: "body",
    icon: `body-${body.source.format}`,
    label: body.name,
    detail: null,
    muted: false,
    renamable: true,
    visibility: null,
    wiring: null,
    stateLabel: null,
    children: [
      ...bodyJointChildren(pantin, body, translate),
      ...sourceNodeChildren(pantin.id, body, translate),
    ],
  };
}

// A joint an actuator moves gets a bolt at the end of its row, a watched joint a
// sensor mark, and both say which actuator or sensors in words (ADR 0028, ADR
// 0023): the icons alone would say nothing to a screen reader.
function jointNode(pantin: PantinResponse, joint: Joint, translate: Translate): TreeNode {
  const actuator = actuatorOfJoint(pantin.document, joint.id);
  const sensors = sensorsOfJoint(pantin.document, joint.id);
  const states = [
    actuator === undefined ? null : translate("tree.driven", { name: actuator.name }),
    sensors.length === 0
      ? null
      : translate("tree.watched", { names: sensors.map((sensor) => sensor.name).join(", ") }),
  ].filter((state) => state !== null);
  return {
    id: jointNodeId(pantin.id, joint.id),
    kind: "joint",
    icon: "joint",
    label: joint.name,
    detail: translate(jointTypeLabelKey(joint.type)),
    muted: false,
    renamable: false,
    visibility: null,
    wiring: { actuatorId: actuator?.id ?? null, sensorIds: sensors.map((sensor) => sensor.id) },
    stateLabel: states.length === 0 ? null : states.join(" · "),
    children: [],
  };
}

// A joint is internal when both its bodies share an assembly (ADR 0019
// point 4): it is listed under that assembly, the others in one folder.
function assemblyOf(pantin: PantinResponse, bodyId: string): string | undefined {
  return pantin.document.bodies.find((body) => body.id === bodyId)?.assembly;
}

function isInternal(pantin: PantinResponse, joint: Joint): boolean {
  return assemblyOf(pantin, joint.parent) === assemblyOf(pantin, joint.child);
}

function assemblyNode(
  pantin: PantinResponse,
  assembly: Assembly,
  display: AssemblyDisplay,
  translate: Translate,
): TreeNode {
  const bodies = pantin.document.bodies.filter((body) => body.assembly === assembly.key);
  const hidden = isAssemblyHidden(display, assembly.key);
  const joints = pantin.document.joints.filter(
    (joint) => isInternal(pantin, joint) && assemblyOf(pantin, joint.child) === assembly.key,
  );
  return {
    id: assemblyNodeId(pantin.id, assembly.key),
    kind: "assembly",
    icon: "assembly",
    label: assembly.name,
    // The key prefixes the tags: shown so that the user sees what the PLC sees.
    detail: assembly.key,
    muted: false,
    renamable: true,
    visibility: hidden ? "hidden" : "shown",
    wiring: null,
    stateLabel: hidden ? translate("tree.hidden") : null,
    children: [
      ...bodies.map((body) => bodyNode(pantin, body, translate)),
      ...joints.map((joint) => jointNode(pantin, joint, translate)),
    ],
  };
}

function betweenAssembliesFolder(pantin: PantinResponse, translate: Translate): TreeNode {
  const joints = pantin.document.joints.filter((joint) => !isInternal(pantin, joint));
  return {
    id: folderNodeId(pantin.id, "betweenAssemblies"),
    kind: "folder",
    icon: "folder",
    label: translate("tree.jointsBetweenAssemblies"),
    detail: String(joints.length),
    muted: false,
    renamable: false,
    visibility: null,
    wiring: null,
    stateLabel: null,
    children: joints.map((joint) => jointNode(pantin, joint, translate)),
  };
}

function pantinNode(
  pantin: PantinResponse,
  display: AssemblyDisplay,
  translate: Translate,
): TreeNode {
  const bodyCount = pantin.document.bodies.length;
  return {
    id: pantinNodeId(pantin.id),
    kind: "pantin",
    icon: "pantin",
    label: pantin.document.name,
    detail: translate(pluralKey("tree.bodyCount", bodyCount), { count: bodyCount }),
    muted: false,
    renamable: true,
    visibility: null,
    wiring: null,
    stateLabel: null,
    children: [
      ...pantin.document.assemblies.map((assembly) =>
        assemblyNode(pantin, assembly, display, translate),
      ),
      betweenAssembliesFolder(pantin, translate),
    ],
  };
}

/** The edit view's tree: exactly one root, the open Pantin; empty in the list view. */
export function buildTree(source: TreeSource, translate: Translate): TreeNode[] {
  const display = source.assemblyDisplay ?? NO_ASSEMBLY_DISPLAY;
  return source.openPantin === null ? [] : [pantinNode(source.openPantin, display, translate)];
}

export function findNode(nodes: readonly TreeNode[], nodeId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const inChildren = findNode(node.children, nodeId);
    if (inChildren !== null) {
      return inChildren;
    }
  }
  return null;
}
