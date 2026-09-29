// Row and group shapes of the properties grid, and what an editable row edits.
// One mechanism for every edit: a row carries an edit target, and committing
// it raises that target with the typed value (rename is one target among others).

export type PropertyGroupId =
  | "general"
  | "source"
  | "mesh"
  | "sourceNodes"
  | "placement"
  | "parameters"
  | "joints";

export type EditTarget =
  // A Pantin or a body, named by its tree node.
  | { kind: "rename"; nodeId: string }
  // One field of a joint, by the form's field id ("origin.x", "limits.lower", "parent").
  | { kind: "jointField"; pantinId: string; jointId: string; fieldId: string };

interface SelectOption {
  value: string;
  label: string;
}

export type RowEditor =
  // Edited inline from the displayed value.
  | { input: "text"; target: EditTarget }
  // Chosen among options; `selected` is the value of the current option.
  | { input: "select"; target: EditTarget; options: SelectOption[]; selected: string };

export interface PropertyRow {
  id: string;
  label: string;
  value: string;
  // Read-only data from the CAD file: drawn greyed, in the source font.
  muted: boolean;
  // Null for read-only rows.
  edit: RowEditor | null;
  // Tree node the value leads to when clicked (a body's joints), or null.
  link: string | null;
}

export interface PropertyGroup {
  id: PropertyGroupId;
  title: string;
  collapsed: boolean;
  rows: PropertyRow[];
}

export type GroupDraft = { id: PropertyGroupId; rows: PropertyRow[] };

export function row(
  id: string,
  label: string,
  value: string,
  edit: RowEditor | null = null,
): PropertyRow {
  return { id, label, value, muted: false, edit, link: null };
}

export function linkRow(id: string, label: string, value: string, nodeId: string): PropertyRow {
  return { ...row(id, label, value), link: nodeId };
}

export function renameEditor(nodeId: string): RowEditor {
  return { input: "text", target: { kind: "rename", nodeId } };
}
