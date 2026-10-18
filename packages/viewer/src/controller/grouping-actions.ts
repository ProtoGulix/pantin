import type { PantinResponse } from "@pantin/protocol";
import { withAssemblyRemoved } from "../assembly-display.ts";
import { groupingTargetOf, ungroupTargetOf } from "../grouping/grouping-model.ts";
import {
  type GroupingKind,
  type GroupingResult,
  groupingResultMessage,
} from "../grouping/grouping-result.ts";
import { withGroupCancelled, withGroupRequested } from "../grouping/grouping-state.ts";
import { createTranslator } from "../i18n/translate.ts";
import { coreRefusalMessage } from "../messages.ts";
import { withPreviousPlacementDropped } from "../previous-placement.ts";
import { selectedNodeIdOf, selectedNodeIdsOf } from "../selection.ts";
import { assemblyNodeId } from "../tree/node-ids.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { type ViewerState, withRequestFinished, withRequestStarted } from "../viewer-state.ts";
import { refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// "Grouper…" and "Dégrouper" (ADR 0055 points 6, 7 and 12). Each is one core
// command: the viewer never composes existing calls, and shows the core's
// refusal as it is.

/** "Grouper…": asks for the group's name over the selected rows, when they can be grouped. */
export function requestGroup(store: ViewerStore): void {
  const { openPantin, selection, multiSelectedNodeIds, language } = store.state;
  const target =
    openPantin === null
      ? null
      : groupingTargetOf(
          openPantin.document,
          openPantin.id,
          selectedNodeIdsOf(selection, multiSelectedNodeIds),
        );
  if (target !== null) {
    const suggestedName = createTranslator(language)("group.defaultName");
    store.update(withGroupRequested(store.state, target, suggestedName));
  }
}

export function cancelGroup(store: ViewerStore): void {
  store.update(withGroupCancelled(store.state));
}

// One command and its answer: the fresh Pantin, then `then` for what the
// command changes around it. A failure shows the core's sentence.
async function runGroupingCommand<Answer extends GroupingResult & { pantin: PantinResponse }>(
  store: ViewerStore,
  kind: GroupingKind,
  send: () => Promise<Answer>,
  then: (state: ViewerState, answer: Answer) => ViewerState,
): Promise<void> {
  store.update(withRequestStarted(store.state));
  try {
    const answer = await send();
    const shown = store.applyIfStillRequested(withRequestFinished(store.state), answer.pantin);
    store.update({
      ...then(shown, answer),
      message: groupingResultMessage(kind, answer, store.state.language),
    });
  } catch (error) {
    store.update({ ...withRequestFinished(store.state), message: coreRefusalMessage(error) });
    return;
  }
  await refreshPantinList(store);
}

/** "Grouper" on the question: the core makes the group; it is then selected. */
export async function confirmGroup(store: ViewerStore): Promise<void> {
  const pending = store.state.pendingGroup;
  const open = store.state.openPantin;
  if (pending === null || open === null || pending.name.trim() === "") {
    return;
  }
  const { target } = pending;
  store.update(withGroupCancelled(store.state));
  await runGroupingCommand(
    store,
    "group",
    async () => {
      const answer = await store.ports.api.groupBodies(open.id, target.assemblyKey, {
        name: pending.name.trim(),
        bodies: target.bodies,
        assemblies: target.assemblies,
      });
      return { ...answer, name: answer.group.name };
    },
    (state, answer) =>
      state.openPantin?.id !== open.id
        ? state
        : withRevealedNode(state, assemblyNodeId(open.id, answer.group.key)),
  );
}

/** "Dégrouper": dissolves the selected group into its structure parent, which is then selected. */
export async function ungroupSelection(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const nodeId = selectedNodeIdOf(store.state.selection);
  const target = open === null ? null : ungroupTargetOf(open.document, open.id, nodeId);
  const parentKey = open?.document.assemblies.find(({ key }) => key === target?.key)?.parent;
  if (open === null || target === null || parentKey === undefined) {
    return;
  }
  await runGroupingCommand(
    store,
    "ungroup",
    async () => ({
      ...(await store.ports.api.ungroupAssembly(open.id, target.key)),
      name: target.name,
    }),
    (state) => ({
      ...withRevealedNode(
        withPreviousPlacementDropped(state, target.key),
        assemblyNodeId(open.id, parentKey),
      ),
      assemblyDisplay: withAssemblyRemoved(state.assemblyDisplay, target.key),
    }),
  );
}
