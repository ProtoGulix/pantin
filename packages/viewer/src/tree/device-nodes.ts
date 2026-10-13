import type { PantinResponse } from "@pantin/protocol";
import type { Language, Translate } from "../i18n/translate.ts";
import {
  DEVICE_FAMILIES,
  type DeviceFamily,
  deviceEntry,
  familyDevices,
} from "./device-families.ts";
import { deviceRowId, familyNodeId } from "./node-ids.ts";
import type { TreeNode } from "./tree-node.ts";

// The folders of devices under an assembly (ADR 0047 point 2), as tree nodes.

function familyFolder(
  pantin: PantinResponse,
  assemblyKey: string,
  family: DeviceFamily,
  language: Language,
  translate: Translate,
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
    children: devices.map(
      (device): TreeNode => ({
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
        stateLabel: null,
        kindLabel: translate(deviceEntry(device.kind).labelKey),
        children: [],
      }),
    ),
  };
}

/** One folder per family that has an element in the assembly, empty families left out. */
export function familyFolders(
  pantin: PantinResponse,
  assemblyKey: string,
  language: Language,
  translate: Translate,
): TreeNode[] {
  return DEVICE_FAMILIES.flatMap((family) => {
    const folder = familyFolder(pantin, assemblyKey, family, language, translate);
    return folder === null ? [] : [folder];
  });
}
