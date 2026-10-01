// Row and group shapes of the properties grid, and what an editable row edits.
// One mechanism for every edit: a row carries an edit target, and committing
// it raises that target with the typed value (rename is one target among others).
// The inspector (ADR 0030) reuses the grid: its rows may also be live, forced
// by a toggle or a numeric command, and link to a device.

import type { DriveType, JointCoordinateUnit } from "@pantin/protocol";
import type { DeviceRef } from "../device-selection.ts";

export type PropertyGroupId =
  | "general"
  | "source"
  | "mesh"
  | "sourceNodes"
  | "placement"
  | "parameters"
  | "joints"
  // Inspector groups (ADR 0030).
  | "commands"
  | "feedback"
  | "faults"
  | "state"
  | "position"
  | "links"
  | "driveIndex"
  | "actuatorIndex"
  | "sensorIndex";

export type EditTarget =
  // A Pantin or a body, named by its tree node.
  | { kind: "rename"; nodeId: string }
  // One field of a joint, by the form's field id ("origin.x", "limits.lower", "parent").
  | { kind: "jointField"; pantinId: string; jointId: string; fieldId: string }
  // The keys that name tags, and a body's assembly: each may rename tags (ADR 0019).
  | { kind: "assemblyKey"; pantinId: string; key: string }
  | { kind: "tagKey"; pantinId: string; jointId: string }
  // Choosing another type opens the joint form with it (ADR 0018).
  | { kind: "jointType"; pantinId: string; jointId: string }
  | { kind: "bodyAssembly"; pantinId: string; bodyId: string }
  // A field of a device in the open Pantin: "name", a parameter field, or a
  // sensor input key ("range.lower"), by the device form's field ids.
  | { kind: "deviceField"; device: DeviceRef; fieldId: string };

interface SelectOption {
  value: string;
  label: string;
}

// What a toggle row flips: a bit tag (forced, as a PLC would), or a fault.
export type ToggleAction =
  | { kind: "bitTag"; tag: string }
  | { kind: "driveUnresponsive"; driveId: string }
  | { kind: "jointJammed"; jointId: string };

export type RowEditor =
  // Edited inline from the displayed value.
  | { input: "text"; target: EditTarget }
  // Chosen among options; `selected` is the value of the current option.
  | { input: "select"; target: EditTarget; options: SelectOption[]; selected: string }
  // On or Off; `on` is what the page shows until a live value replaces it.
  | { input: "toggle"; action: ToggleAction; on: boolean }
  // A number typed in mm or degrees and sent to a tag with a button.
  | { input: "number"; tag: string };

// A value that changes at every simulation step: the page writes it in place
// from the latest tag read, so that typing is never disturbed.
export type LiveSource =
  // `unit` converts a coordinate to mm or degrees; a bit shows as On or Off.
  | { kind: "tag"; tag: string; unit: JointCoordinateUnit; format: "number" | "bit" }
  // The warnings of a drive (ADR 0028 point 5), one line each.
  | { kind: "diagnostics"; driveId: string; driveType: DriveType }
  // One line for an index: the drive's diagnostics, else its lit commands.
  | {
      kind: "driveStatus";
      driveId: string;
      driveType: DriveType;
      commands: { tag: string; label: string }[];
    };

// What a click on a link row selects.
export type RowLink = { kind: "node"; nodeId: string } | { kind: "device"; device: DeviceRef };

export interface PropertyRow {
  id: string;
  label: string;
  value: string;
  // Read-only data from the CAD file: drawn greyed, in the source font.
  muted: boolean;
  // Null for read-only rows.
  edit: RowEditor | null;
  // What the value leads to when clicked (a body's joints, a device), or null.
  link: RowLink | null;
  // Written in place after every tag read, or null.
  live: LiveSource | null;
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
  return { id, label, value, muted: false, edit, link: null, live: null };
}

export function linkRow(id: string, label: string, value: string, nodeId: string): PropertyRow {
  return { ...row(id, label, value), link: { kind: "node", nodeId } };
}

export function deviceLinkRow(
  id: string,
  label: string,
  value: string,
  device: DeviceRef,
): PropertyRow {
  return { ...row(id, label, value), link: { kind: "device", device } };
}

export function liveRow(
  id: string,
  label: string,
  live: LiveSource,
  edit: RowEditor | null = null,
): PropertyRow {
  return { ...row(id, label, "", edit), live };
}

/** The page's handle on a live cell, unique in one grid. */
export function liveKey(groupId: PropertyGroupId, rowId: string): string {
  return `${groupId}/${rowId}`;
}

/** The focus key of a row's field, which survives a redraw of the grid (ui/focus.ts). */
export function rowFocusKey(rowId: string): string {
  return `property-${rowId}`;
}

export function renameEditor(nodeId: string): RowEditor {
  return { input: "text", target: { kind: "rename", nodeId } };
}
