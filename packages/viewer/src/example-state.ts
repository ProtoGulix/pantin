import type { ExampleSummary } from "@pantin/protocol";
import type { ViewerState } from "./viewer-state.ts";

// The name prompt of the Home tab (ADR 0027 point 3, ADR 0062 point 6) is
// shared by "Empty Pantin" and the example cards: one prompt is open at a time.

/** The "Empty Pantin" tile: opens its prompt, or closes it; an example prompt gives way. */
export function withCreatePromptToggled(state: ViewerState): ViewerState {
  return {
    ...state,
    creatingPantin: !state.creatingPantin,
    examples: { ...state.examples, copyingId: null },
  };
}

/** An example card: opens the prompt for that example, or closes it if it was already open. */
export function withExamplePromptToggled(state: ViewerState, exampleId: string): ViewerState {
  const alreadyOpen = state.examples.copyingId === exampleId;
  return {
    ...state,
    creatingPantin: false,
    examples: { ...state.examples, copyingId: alreadyOpen ? null : exampleId },
  };
}

export function withExamplesListed(
  state: ViewerState,
  offered: readonly ExampleSummary[],
): ViewerState {
  return { ...state, examples: { ...state.examples, offered } };
}

/** The prompt closed (copy done, Escape, dialog hidden). */
export function withExamplePromptClosed(state: ViewerState): ViewerState {
  return { ...state, examples: { ...state.examples, copyingId: null } };
}

/** The example whose prompt is open, or undefined (none, or it left the list). */
export function exampleBeingCopied(state: ViewerState): ExampleSummary | undefined {
  return state.examples.offered.find((example) => example.id === state.examples.copyingId);
}
