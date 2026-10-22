import type { DriveRuntime, PantinDocument, Tag } from "@pantin/protocol";
import type { BridgeModel } from "../bridge/bridge-model.ts";
import type { BridgeView } from "../bridge/bridge-view.ts";
import type { OpcuaBridgeView } from "../bridge/opcua-view.ts";
import type { ClockView } from "../clock/clock-model.ts";
import type { Viewport } from "../scene/viewport.ts";
import { stateMarksKey } from "../tree/device-state.ts";
import type { ViewerState } from "../viewer-state.ts";
import { showBridgeCards } from "./bridge-cards.ts";

// What one read of the tags changes on screen: values and forced tags reach the
// live cells without a redraw, the panel is redrawn only when a mark flips.

/** The names of the forced tags of an answer of the core. */
export function forcedTagNames(tags: readonly Tag[]): ReadonlySet<string> {
  return new Set(tags.filter((tag) => tag.forced).map((tag) => tag.name));
}

function sameMembers(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  return first.size === second.size && [...first].every((name) => second.has(name));
}

interface TagRead {
  values: ReadonlyMap<string, number>;
  forced: ReadonlySet<string>;
}

/** Which parts of the screen the new read touches: the tree's marks, the forced count. */
function tagReadChanges(
  document: PantinDocument | undefined,
  previous: TagRead,
  next: TagRead,
): { marks: boolean; forced: boolean } {
  return {
    marks:
      document !== undefined &&
      stateMarksKey(document, previous.values) !== stateMarksKey(document, next.values),
    forced: !sameMembers(previous.forced, next.forced),
  };
}

// What a read changes in the viewer store, named structurally: the store imports
// this file, so it cannot be imported back.
interface TagReadTarget {
  state: ViewerState;
  tagValues: ReadonlyMap<string, number>;
  driveRuntime: ReadonlyMap<string, DriveRuntime>;
  forcedTags: ReadonlySet<string>;
  bridgeModel: BridgeModel;
  ports: {
    showInspectorLive(
      tags: ReadonlyMap<string, number>,
      runtime: ReadonlyMap<string, DriveRuntime>,
      forced: ReadonlySet<string>,
    ): void;
    showDiagramLive(
      tags: ReadonlyMap<string, number>,
      runtime: ReadonlyMap<string, DriveRuntime>,
      forced: ReadonlySet<string>,
    ): void;
    showClock(view: ClockView): void;
    showBridge(view: BridgeView | null): void;
    showOpcuaBridge(view: OpcuaBridgeView | null): void;
    viewport(): Pick<Viewport, "showTagStates">;
  };
  renderPanel(): void;
  clockView(): ClockView;
}

export function showTagRead(
  target: TagReadTarget,
  values: ReadonlyMap<string, number>,
  runtime: ReadonlyMap<string, DriveRuntime>,
  forced: ReadonlySet<string>,
): void {
  const previous = { values: target.tagValues, forced: target.forcedTags };
  const changes = tagReadChanges(target.state.openPantin?.document, previous, { values, forced });
  target.tagValues = values;
  target.driveRuntime = runtime;
  target.forcedTags = forced;
  // The tree's marks are part of the panel: redrawn when one flips, not at every poll.
  if (changes.marks) {
    target.renderPanel();
  }
  const { ports } = target;
  ports.showInspectorLive(values, runtime, forced);
  ports.viewport().showTagStates(values);
  ports.showDiagramLive(values, runtime, forced);
  // The transport bar and the bridge card count the forced tags.
  if (changes.forced) {
    ports.showClock(target.clockView());
    showBridgeCards(ports, target.bridgeModel, target.state, forced.size);
  }
}
