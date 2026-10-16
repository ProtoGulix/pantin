import type { PantinResponse } from "@pantin/protocol";
import type { Language, Translate } from "../i18n/translate.ts";
import {
  DEVICE_FAMILIES,
  type DeviceFamily,
  deviceEntry,
  familyDevices,
} from "./device-families.ts";
import { NO_TAG_VALUES, STATE_MARK_LABELS, stateMarkOf, type TagValues } from "./device-state.ts";
import { deviceRowId, familyNodeId } from "./node-ids.ts";
import type { TreeNode } from "./tree-node.ts";

// The folders of devices under an assembly (ADR 0047 point 2), as tree nodes.

function familyFolder(
  pantin: PantinResponse,
  assemblyKey: string,
  family: DeviceFamily,
  language: Language,
  translate: Translate,
  tagValues: TagValues,
): TreeNode | null {
  const devices = familyDevices({ document: pantin.document, language }, family, assemblyKey);
  if (devices.length === 0) {
    return null;
  }
  return {
    id: familyNodeId(pantin.id, assemblyKey, family.key),
    kind: "family",
    icon: "folder",
    label: translate(family.labelKey),
    detail: String(devices.length),
    muted: false,
    renamable: false,
    visibility: null,
    wiring: null,
    stateLabel: null,
    kindLabel: null,
    stateMark: null,
    children: devices.map((device): TreeNode => {
      const mark = stateMarkOf(device.stateTag, tagValues);
      return {
        id: deviceRowId(pantin.id, device.kind, device.id),
        kind: "device",
        icon: deviceEntry(device.kind).icon,
        label: device.name,
        detail: device.detail,
        muted: false,
        // Rename stays in the inspector (ADR 0047 point 5).
        renamable: false,
        visibility: null,
        wiring: null,
        stateLabel: mark === null ? null : translate(STATE_MARK_LABELS[mark]),
        kindLabel: translate(deviceEntry(device.kind).labelKey),
        stateMark: mark,
        children: [],
      };
    }),
  };
}

/** One folder per family that has an element in the assembly, empty families left out. */
export function familyFolders(
  pantin: PantinResponse,
  assemblyKey: string,
  language: Language,
  translate: Translate,
  tagValues: TagValues = NO_TAG_VALUES,
): TreeNode[] {
  return DEVICE_FAMILIES.flatMap((family) => {
    const folder = familyFolder(pantin, assemblyKey, family, language, translate, tagValues);
    return folder === null ? [] : [folder];
  });
}
