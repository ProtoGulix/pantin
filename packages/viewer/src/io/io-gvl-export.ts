import type { MessageKey } from "../i18n/translate.ts";
import type { IoState } from "./io-state.ts";

// Display logic of the "Export GVL" action (ADR 0049 amendment). The core
// decides whether a GVL exists; the viewer only reads the mapping it already
// holds to avoid a request that is known to be refused (409).

export interface IoGvlExport {
  enabled: boolean;
  // Tooltip: why the action is unavailable, or what the file contains.
  titleKey: MessageKey;
}

export function ioGvlExportOf(state: IoState): IoGvlExport {
  const mapping = state.mapping;
  if (mapping === null) {
    return { enabled: false, titleKey: "io.gvl.unknown" };
  }
  if (mapping.status === "missing") {
    return { enabled: false, titleKey: "io.gvl.missing" };
  }
  if (mapping.status === "invalid") {
    return { enabled: false, titleKey: "io.gvl.invalid" };
  }
  return { enabled: true, titleKey: "io.gvl.title" };
}
