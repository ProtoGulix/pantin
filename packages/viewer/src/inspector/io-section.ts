import type { Translate } from "../i18n/translate.ts";
import { type ElementTag, tagsOfOwner } from "../io/io-element-tags.ts";
import { ownerOfSelection } from "../io/io-owner.ts";
import { effectiveModuleKey, isMappingCurrent } from "../io/io-state.ts";
import { ioModeOf } from "../io/io-view-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// The "E/S" / "I/O" section of the inspector (ADR 0049 point 11): the tags the
// selected device or joint owns, with their mapping as the core reported it.

export interface InspectorIoTag {
  name: string;
  // "m1, address 3, GVL.x" or "not mapped".
  status: string;
  mapped: boolean;
  // "Map", unmapped tags only: disabled with the reason as its tooltip.
  assign: { label: string; title: string; moduleKey: string | null } | null;
  // "Open in I/O", mapped tags only.
  openTitle: string | null;
}

export interface InspectorIoView {
  title: string;
  // The label of "Open in I/O", the same on every row.
  openLabel: string;
  // A request is in flight: "Map" waits, as the I/O view's buttons do.
  busy: boolean;
  tags: readonly InspectorIoTag[];
  // The mapping could not be read: one line and Retry in place of the tags.
  unavailable: { text: string; retryLabel: string } | null;
}

// Where "Map" sends a tag, and why it cannot: no module, or a file that cannot be edited.
function assignTarget(state: ViewerState, t: Translate): { module: string | null; reason: string } {
  const editable = ioModeOf(state.io) === "editing";
  const module = editable ? effectiveModuleKey(state.io) : null;
  return {
    module,
    reason: editable ? t("io.section.assignNoModule") : t("io.section.assignUnreadable"),
  };
}

function tagView(
  tag: ElementTag,
  target: ReturnType<typeof assignTarget>,
  t: Translate,
): InspectorIoTag {
  if (tag.channel !== null) {
    const { moduleKey, address, variable } = tag.channel;
    return {
      name: tag.name,
      status: t("io.section.mapped", { module: moduleKey, address, variable }),
      mapped: true,
      assign: null,
      openTitle: t("io.section.openTitle", { tag: tag.name, module: moduleKey }),
    };
  }
  const { module } = target;
  return {
    name: tag.name,
    status: t("io.section.unmapped"),
    mapped: false,
    assign: {
      label: t("io.section.assign"),
      title:
        module === null ? target.reason : t("io.section.assignTitle", { tag: tag.name, module }),
      moduleKey: module,
    },
    openTitle: null,
  };
}

/** Null when the selection owns no tag, or while the mapping is being read. */
export function buildInspectorIoView(state: ViewerState, t: Translate): InspectorIoView | null {
  const owner = ownerOfSelection(state.selection);
  if (owner === null) {
    return null;
  }
  const base = { title: t("io.section.title"), openLabel: t("io.section.open") };
  const busy = state.pendingRequestCount > 0;
  // A stale or foreign mapping would list tags the document no longer has.
  if (!isMappingCurrent(state)) {
    return state.io.failedFor !== null && state.io.failedFor === state.openPantin
      ? {
          ...base,
          busy,
          tags: [],
          unavailable: { text: t("io.section.unavailable"), retryLabel: t("io.retry") },
        }
      : null;
  }
  const tags = tagsOfOwner(state.io.mapping, owner);
  if (tags.length === 0) {
    return null;
  }
  const target = assignTarget(state, t);
  return { ...base, busy, unavailable: null, tags: tags.map((tag) => tagView(tag, target, t)) };
}
