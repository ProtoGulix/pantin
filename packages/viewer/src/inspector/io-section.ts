import type { BridgeStatus } from "@pantin/protocol";
import {
  MODULE_CONNECTION_KEYS,
  moduleConnection,
  moduleConnectionTone,
  type StatusTone,
} from "../bridge/module-connection.ts";
import type { Translate } from "../i18n/translate.ts";
import { type ElementTag, tagsOfOwner } from "../io/io-element-tags.ts";
import { ownerOfSelection } from "../io/io-owner.ts";
import { effectiveModuleKey, isMappingCurrent } from "../io/io-state.ts";
import { ioModeOf } from "../io/io-view-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// The "E/S" / "I/O" section of the inspector (ADR 0049 point 11): the tags the
// selected device or joint owns, with their mapping as the core reported it.

// The id of the section in the grid: the key its collapsed state is stored under.
export const IO_SECTION_ID = "io";

export interface InspectorIoTag {
  name: string;
  // The label the element's other sections give the tag, else its short name.
  label: string;
  // "m1 · coil 0", or "not mapped".
  status: string;
  mapped: boolean;
  // The module's bridge status as a dot and its text; mapped tags only.
  connection: { tone: StatusTone; text: string } | null;
  // The row's tooltip: the full tag name, and the CODESYS variable when mapped.
  title: string;
  // "Map", unmapped tags only: disabled with the reason as its tooltip.
  assign: { label: string; title: string; moduleKey: string | null } | null;
  // "Open in I/O", mapped tags only: the sentence naming tag and module is its aria-label.
  openTitle: string | null;
}

export interface InspectorIoView {
  title: string;
  collapsed: boolean;
  // The label of "Open in I/O", the same on every row.
  openLabel: string;
  // A request is in flight: "Map" waits, as the I/O view's buttons do.
  busy: boolean;
  tags: readonly InspectorIoTag[];
  // The mapping could not be read: one muted row and Retry in place of the tags.
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

interface TagContext {
  target: ReturnType<typeof assignTarget>;
  bridgeStatus: BridgeStatus | null;
  labels: ReadonlyMap<string, string>;
  t: Translate;
}

const shortName = (name: string): string => name.slice(name.lastIndexOf(".") + 1);

function tagView(tag: ElementTag, context: TagContext): InspectorIoTag {
  const { target, bridgeStatus, labels, t } = context;
  const label = labels.get(tag.name) ?? shortName(tag.name);
  if (tag.channel !== null) {
    const { moduleKey, place, variable } = tag.channel;
    const connection = moduleConnection(bridgeStatus, moduleKey);
    return {
      name: tag.name,
      label,
      status: t("io.section.mapped", { module: moduleKey, place }),
      mapped: true,
      connection: {
        tone: moduleConnectionTone(connection),
        text: t(MODULE_CONNECTION_KEYS[connection]),
      },
      title: `${tag.name} · ${variable}`,
      assign: null,
      openTitle: t("io.section.openTitle", { tag: tag.name, module: moduleKey }),
    };
  }
  const { module } = target;
  return {
    name: tag.name,
    label,
    status: t("io.section.unmapped"),
    mapped: false,
    connection: null,
    title: tag.name,
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
export function buildInspectorIoView(
  state: ViewerState,
  t: Translate,
  bridgeStatus: BridgeStatus | null = null,
  labels: ReadonlyMap<string, string> = new Map(),
): InspectorIoView | null {
  const owner = ownerOfSelection(state.selection);
  if (owner === null) {
    return null;
  }
  const base = {
    title: t("io.section.title"),
    collapsed: state.collapsedPropertyGroups.has(IO_SECTION_ID),
    openLabel: t("io.section.open"),
  };
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
  const tags = tagsOfOwner(state.io.mapping, owner, state.language);
  if (tags.length === 0) {
    return null;
  }
  const context = { target: assignTarget(state, t), bridgeStatus, labels, t };
  return { ...base, busy, unavailable: null, tags: tags.map((tag) => tagView(tag, context)) };
}
