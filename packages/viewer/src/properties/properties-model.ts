import type { Body, PantinResponse } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import type { TreeSource } from "../tree/tree-model.ts";

// The CODESYS-like "Property | Value" grid for the selected tree node, as
// plain data. Groups keep a stable id so their collapsed state survives a
// change of selection.

type PropertyGroupId = "general" | "source" | "mesh" | "sourceNodes";

export interface PropertyRow {
  id: string;
  label: string;
  value: string;
  // Read-only data from the CAD file: drawn greyed, in the source font.
  muted: boolean;
  // Node to rename when the value is edited; null for read-only rows.
  renameNodeId: string | null;
}

export interface PropertyGroup {
  id: PropertyGroupId;
  title: string;
  collapsed: boolean;
  rows: PropertyRow[];
}

type GroupDraft = { id: PropertyGroupId; rows: PropertyRow[] };

const GROUP_TITLES: Readonly<Record<PropertyGroupId, MessageKey>> = {
  general: "properties.group.general",
  source: "properties.group.source",
  mesh: "properties.group.mesh",
  sourceNodes: "properties.group.sourceNodes",
};

function row(
  id: string,
  label: string,
  value: string,
  renameNodeId: string | null = null,
): PropertyRow {
  return { id, label, value, muted: false, renameNodeId };
}

function pantinGroups(pantin: PantinResponse, nodeId: string, t: Translate): GroupDraft[] {
  const { document } = pantin;
  return [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), document.name, nodeId),
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

function bodyGroups(body: Body, nodeId: string, t: Translate): GroupDraft[] {
  const { source } = body;
  return [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), body.name, nodeId),
        row("id", t("properties.id"), body.id),
      ],
    },
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

function groupsFor(source: TreeSource, nodeId: string, t: Translate): GroupDraft[] {
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
    const count = String(open.document.bodies.length);
    return [
      {
        id: "general",
        rows: [
          row("name", t("properties.name"), t("tree.bodies")),
          row("count", t("properties.itemCount"), count),
        ],
      },
    ];
  }
  const body = open.document.bodies.find((candidate) => candidate.id === ref.bodyId);
  if (body === undefined) {
    return [];
  }
  return ref.kind === "body" ? bodyGroups(body, nodeId, t) : sourceNodeGroups(body, ref.index, t);
}

/** Groups for the selected node, or an empty list when nothing is selected. */
export function buildPropertyGroups(
  source: TreeSource,
  selectedNodeId: string | null,
  collapsedGroups: ReadonlySet<string>,
  translate: Translate,
): PropertyGroup[] {
  if (selectedNodeId === null) {
    return [];
  }
  return groupsFor(source, selectedNodeId, translate).map((draft) => ({
    ...draft,
    title: translate(GROUP_TITLES[draft.id]),
    collapsed: collapsedGroups.has(draft.id),
  }));
}
