import type { Assembly, Body, PantinResponse } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { jointNodeId, parseNodeId } from "../tree/node-ids.ts";
import { buildTree, findNode, type TreeSource } from "../tree/tree-model.ts";
import { jointGroups } from "./joint-groups.ts";
import { assemblyPlacementGroup, bodyPlacementGroup } from "./placement-groups.ts";
import { type GroupDraft, linkRow, type PropertyRow, renameEditor, row } from "./property-rows.ts";

// The CODESYS-like "Property | Value" groups of a tree node, as plain data
// (shapes in property-rows.ts); the inspector shows them (ADR 0030 point 2).
// Groups keep a stable id so their collapsed state survives a change of
// selection.

function pantinGroups(pantin: PantinResponse, nodeId: string, t: Translate): GroupDraft[] {
  const { document } = pantin;
  return [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), document.name, renameEditor(nodeId)),
        row("id", t("properties.id"), pantin.id),
        row("bodyCount", t("properties.bodyCount"), String(document.bodies.length)),
        row(
          "unsaved",
          t("properties.unsaved"),
          t(pantin.unsavedChanges ? "properties.yes" : "properties.no"),
        ),
      ],
    },
  ];
}

function assemblyGroups(
  assembly: Assembly,
  pantin: PantinResponse,
  nodeId: string,
  t: Translate,
): GroupDraft[] {
  const bodyCount = pantin.document.bodies.filter((body) => body.assembly === assembly.key).length;
  const target = { kind: "assemblyKey" as const, pantinId: pantin.id, key: assembly.key };
  return [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), assembly.name, renameEditor(nodeId)),
        // The key prefixes the tags: renaming it renames them (ADR 0019).
        row("key", t("properties.assemblyKey"), assembly.key, { input: "text", target }),
        row("bodyCount", t("properties.bodyCount"), String(bodyCount)),
      ],
    },
    assemblyPlacementGroup(assembly, pantin, t),
  ];
}

// Moving a body to another assembly moves its parent joint, whose tags follow.
function assemblyRow(body: Body, pantin: PantinResponse, t: Translate): PropertyRow {
  const { assemblies } = pantin.document;
  const current = assemblies.find((assembly) => assembly.key === body.assembly);
  return row("assembly", t("properties.assembly"), current?.name ?? body.assembly, {
    input: "select",
    target: { kind: "bodyAssembly", pantinId: pantin.id, bodyId: body.id },
    options: assemblies.map((assembly) => ({ value: assembly.key, label: assembly.name })),
    selected: body.assembly,
  });
}

function sourceNodeRows(body: Body, t: Translate): PropertyRow[] {
  if (body.source.nodes.length === 0) {
    return [{ ...row("none", t("properties.noSourceNode"), ""), muted: true }];
  }
  return body.source.nodes.map((node, index) => ({
    ...row(
      `node-${index}`,
      node.path.join("/"),
      node.name === "" ? t("tree.unnamedNode") : node.name,
    ),
    muted: true,
  }));
}

// Every joint that holds the body, as parent or as child; a click selects it.
function bodyJointRows(body: Body, pantin: PantinResponse, t: Translate): PropertyRow[] {
  const { bodies, joints } = pantin.document;
  const bodyName = (bodyId: string) =>
    bodies.find((candidate) => candidate.id === bodyId)?.name ?? bodyId;
  const rows = joints.flatMap((joint): PropertyRow[] => {
    if (joint.child !== body.id && joint.parent !== body.id) {
      return [];
    }
    // A joint linking the body to itself reads as "child of", like the 3D tint.
    const isChild = joint.child === body.id;
    const role = t(isChild ? "properties.jointRole.childOf" : "properties.jointRole.parentOf", {
      type: t(jointTypeLabelKey(joint.type)),
      body: bodyName(isChild ? joint.parent : joint.child),
    });
    return [linkRow(`joint-${joint.id}`, joint.name, role, jointNodeId(pantin.id, joint.id))];
  });
  return rows.length > 0 ? rows : [{ ...row("none", t("properties.noJoint"), ""), muted: true }];
}

function bodyGroups(
  body: Body,
  pantin: PantinResponse,
  nodeId: string,
  t: Translate,
): GroupDraft[] {
  const { source } = body;
  return [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), body.name, renameEditor(nodeId)),
        row("id", t("properties.id"), body.id),
        assemblyRow(body, pantin, t),
      ],
    },
    ...bodyPlacementGroup(body, pantin, t),
    { id: "joints", rows: bodyJointRows(body, pantin, t) },
    {
      id: "source",
      rows: [
        row("file", t("properties.file"), source.fileName),
        row("format", t("properties.format"), t(`format.${source.format}`)),
        row("unit", t("properties.unit"), t(`unit.${source.unit}`)),
        row("upAxis", t("properties.upAxis"), t(`upAxis.${source.upAxis}`)),
      ],
    },
    { id: "mesh", rows: [row("meshFile", t("properties.meshFile"), body.mesh)] },
    { id: "sourceNodes", rows: sourceNodeRows(body, t) },
  ];
}

function folderGroups(source: TreeSource, nodeId: string, t: Translate): GroupDraft[] {
  // The folder's own label and size come from the tree, so a new folder needs nothing here.
  const node = findNode(buildTree(source, t), nodeId);
  return node === null
    ? []
    : [
        {
          id: "general",
          rows: [
            row("name", t("properties.name"), node.label),
            row("count", t("properties.itemCount"), String(node.children.length)),
          ],
        },
      ];
}

function sourceNodeGroups(body: Body, index: number, t: Translate): GroupDraft[] {
  const node = body.source.nodes[index];
  if (node === undefined) {
    return [];
  }
  const name = node.name === "" ? t("tree.unnamedNode") : node.name;
  return [
    {
      id: "general",
      rows: [
        { ...row("originalName", t("properties.originalName"), name), muted: true },
        { ...row("path", t("properties.path"), node.path.join("/")), muted: true },
      ],
    },
  ];
}

export interface PropertySource extends TreeSource {
  // See ViewerState; absent means none.
  customAxisJointIds?: ReadonlySet<string>;
}

/** The properties of a tree node, as groups; none for a node the Pantin no longer has. */
export function nodeGroups(source: PropertySource, nodeId: string, t: Translate): GroupDraft[] {
  const ref = parseNodeId(nodeId);
  if (ref === null) {
    return [];
  }
  const open = source.openPantin?.id === ref.pantinId ? source.openPantin : null;
  if (open === null) {
    return [];
  }
  if (ref.kind === "pantin") {
    return pantinGroups(open, nodeId, t);
  }
  if (ref.kind === "folder") {
    return folderGroups(source, nodeId, t);
  }
  if (ref.kind === "assembly") {
    const assembly = open.document.assemblies.find((candidate) => candidate.key === ref.key);
    return assembly === undefined ? [] : assemblyGroups(assembly, open, nodeId, t);
  }
  if (ref.kind === "joint") {
    const joint = open.document.joints.find((candidate) => candidate.id === ref.jointId);
    const customAxis = source.customAxisJointIds?.has(ref.jointId) ?? false;
    if (joint === undefined) {
      return [];
    }
    return jointGroups(joint, open, customAxis, t);
  }
  const body = open.document.bodies.find((candidate) => candidate.id === ref.bodyId);
  if (body === undefined) {
    return [];
  }
  return ref.kind === "body"
    ? bodyGroups(body, open, nodeId, t)
    : sourceNodeGroups(body, ref.index, t);
}
