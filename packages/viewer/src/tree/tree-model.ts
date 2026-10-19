import {
  type Assembly,
  type Body,
  endpointAssemblyIn,
  type Joint,
  type JointEndpoint,
  type PantinResponse,
} from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import {
  type AssemblyDisplay,
  isAssemblyHidden,
  NO_ASSEMBLY_DISPLAY,
} from "../assembly-display.ts";
import { childAssemblies } from "../assembly-tree.ts";
import { type Language, pluralKey, type Translate } from "../i18n/translate.ts";
import { bodyRoleInJoint, groupRoleInJoint, type JointEndRole } from "../joint-bodies.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { sensorsOfJoint } from "../sensors/joint-sensors.ts";
import { familyFolders } from "./device-nodes.ts";
import { NO_TAG_VALUES, type TagValues } from "./device-state.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  groupJointNodeId,
  jointNodeId,
  pantinNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";
import type { TreeNode } from "./tree-node.ts";

// The tree of the left panel as plain data: first the full tree of nodes,
// then the flat list of visible rows the DOM draws. Pure, so it is tested
// without a browser.

export interface TreeSource {
  // For the plural of "N bodies".
  language: Language;
  openPantin: PantinResponse | null;
  // Absent means every assembly is shown.
  assemblyDisplay?: AssemblyDisplay;
  // The polled tag values, for the on or off marks of sensor rows; absent means none known.
  tagValues?: TagValues;
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
    kindLabel: null,
    stateMark: null,
    children: [],
  }));
}

// The joints holding a body or a group, listed under it before the other
// children; the detail says whether it is the joint's parent or its child.
// By the joint's own ends: a group is never listed through a stand-in body.
function endJointChildren(
  pantin: PantinResponse,
  roleOf: (joint: Joint) => JointEndRole | null,
  nodeIdOf: (joint: Joint) => string,
  translate: Translate,
): TreeNode[] {
  return pantin.document.joints.flatMap((joint): TreeNode[] => {
    const role = roleOf(joint);
    if (role === null) {
      return [];
    }
    return [
      {
        ...jointNode(pantin, joint, translate),
        id: nodeIdOf(joint),
        detail: translate(`tree.jointRole.${role}`, {
          type: translate(jointTypeLabelKey(joint.type)),
        }),
      },
    ];
  });
}

function bodyJointChildren(pantin: PantinResponse, body: Body, translate: Translate): TreeNode[] {
  return endJointChildren(
    pantin,
    (joint) => bodyRoleInJoint(joint, body.id),
    (joint) => jointNodeId(pantin.id, joint.id, body.id),
    translate,
  );
}

// The joints listed in the assembly's own list of internal joints (below).
function isListedInAssembly(pantin: PantinResponse, joint: Joint, key: string): boolean {
  return isInternal(pantin, joint) && assemblyOf(pantin, joint.child) === key;
}

// A joint between the group and one of its own bodies is already in that list:
// it is not listed a second time.
function groupJointChildren(
  pantin: PantinResponse,
  assembly: Assembly,
  translate: Translate,
): TreeNode[] {
  return endJointChildren(
    pantin,
    (joint) =>
      isListedInAssembly(pantin, joint, assembly.key)
        ? null
        : groupRoleInJoint(joint, assembly.key),
    (joint) => groupJointNodeId(pantin.id, joint.id, assembly.key),
    translate,
  );
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
    kindLabel: null,
    stateMark: null,
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
    kindLabel: null,
    stateMark: null,
    children: [],
  };
}

// A joint is internal when both its bodies share an assembly (ADR 0019
// point 4): it is listed under that assembly, the others in one folder.
function assemblyOf(pantin: PantinResponse, endpoint: JointEndpoint): string | undefined {
  return endpointAssemblyIn(endpoint, pantin.document.bodies);
}

function isInternal(pantin: PantinResponse, joint: Joint): boolean {
  return assemblyOf(pantin, joint.parent) === assemblyOf(pantin, joint.child);
}

function assemblyNode(
  pantin: PantinResponse,
  assembly: Assembly,
  display: AssemblyDisplay,
  translate: Translate,
  language: Language,
  tagValues: TagValues,
): TreeNode {
  const bodies = pantin.document.bodies.filter((body) => body.assembly === assembly.key);
  const hidden = isAssemblyHidden(display, assembly.key, pantin.document.assemblies);
  const joints = pantin.document.joints.filter((joint) =>
    isListedInAssembly(pantin, joint, assembly.key),
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
    kindLabel: null,
    stateMark: null,
    // Sub-assemblies first (structure), then bodies and internal joints (ADR 0040),
    // then the folders of devices (ADR 0047 point 2).
    children: [
      ...childAssemblies(pantin.document.assemblies, assembly.key).map((child) =>
        assemblyNode(pantin, child, display, translate, language, tagValues),
      ),
      ...groupJointChildren(pantin, assembly, translate),
      ...bodies.map((body) => bodyNode(pantin, body, translate)),
      ...joints.map((joint) => jointNode(pantin, joint, translate)),
      ...familyFolders(pantin, assembly.key, language, translate, tagValues),
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
    kindLabel: null,
    stateMark: null,
    children: joints.map((joint) => jointNode(pantin, joint, translate)),
  };
}

function pantinNode(
  pantin: PantinResponse,
  display: AssemblyDisplay,
  translate: Translate,
  language: Language,
  tagValues: TagValues,
): TreeNode {
  const bodyCount = pantin.document.bodies.length;
  return {
    id: pantinNodeId(pantin.id),
    kind: "pantin",
    icon: "pantin",
    label: pantin.document.name,
    detail: translate(pluralKey("tree.bodyCount", bodyCount, language), { count: bodyCount }),
    muted: false,
    renamable: true,
    visibility: null,
    wiring: null,
    stateLabel: null,
    kindLabel: null,
    stateMark: null,
    children: [
      ...childAssemblies(pantin.document.assemblies, undefined).map((assembly) =>
        assemblyNode(pantin, assembly, display, translate, language, tagValues),
      ),
      betweenAssembliesFolder(pantin, translate),
    ],
  };
}

/** The edit view's tree: exactly one root, the open Pantin; empty in the list view. */
export function buildTree(source: TreeSource, translate: Translate): TreeNode[] {
  const display = source.assemblyDisplay ?? NO_ASSEMBLY_DISPLAY;
  return source.openPantin === null
    ? []
    : [
        pantinNode(
          source.openPantin,
          display,
          translate,
          source.language,
          source.tagValues ?? NO_TAG_VALUES,
        ),
      ];
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
