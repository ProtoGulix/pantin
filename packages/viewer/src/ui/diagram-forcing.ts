import {
  parseForcedInput,
  type SocketAction,
  socketAction,
  socketOf,
} from "../diagram/diagram-forcing.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Forcing a command tag from the diagram (ADR 0030 point 3), by pointer and by
// key. What a press means is the pure socketAction; this carries it out through
// the intents the inspector uses, so a toggle and a typed value are written the
// same way (the typed value is converted to SI by the tag write).

type ShownModel = Extract<DiagramModel, { shown: true }>;

export interface ForcingContext {
  model(): ShownModel | null;
  intents(): PanelIntents | null;
  // A small input beside the socket, for a numeric command.
  openValueInput(opener: Element, tag: string): void;
}

/** Carries out a toggle or an input; false for any other decision, which the caller handles. */
export function runForcing(
  action: SocketAction,
  opener: Element,
  context: Pick<ForcingContext, "openValueInput"> & {
    intents: Pick<PanelIntents, "toggleBitTag">;
  },
): boolean {
  if (action.kind === "toggle") {
    context.intents.toggleBitTag(action.tag);
  } else if (action.kind === "openInput") {
    context.openValueInput(opener, action.tag);
  }
  return action.kind === "toggle" || action.kind === "openInput";
}

/** Writes the typed value of a numeric command; false, and nothing sent, when it is not a number. */
export function submitForcedValue(
  tag: string,
  text: string,
  intents: Pick<PanelIntents, "writeFloatTag">,
): boolean {
  if (!parseForcedInput(text).ok) {
    return false;
  }
  intents.writeFloatTag(tag, text);
  return true;
}

/**
 * A click on a command socket forces it and goes no further: the capture
 * phase stops it before the node's own click, which would select the node and
 * make the inspector jump during a test.
 */
export function listenToSocketClicks(svg: SVGElement, context: ForcingContext): void {
  svg.addEventListener(
    "click",
    (event) => {
      const item = event.target instanceof Element ? event.target.closest("[data-forcing]") : null;
      const nodeId = item?.getAttribute("data-node-id");
      const socketId = item?.getAttribute("data-socket-id");
      const model = context.model();
      const intents = context.intents();
      if (item === null || nodeId == null || socketId == null) {
        return;
      }
      event.stopPropagation();
      const socket = model === null ? null : socketOf(model.diagram, { nodeId, socketId });
      if (socket !== null && intents !== null) {
        const { openValueInput } = context;
        runForcing(socketAction(socket, "click"), item, { intents, openValueInput });
      }
    },
    true,
  );
}
