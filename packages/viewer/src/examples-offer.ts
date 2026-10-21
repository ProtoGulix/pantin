import type { ExampleSummary } from "@pantin/protocol";

// The example Pantins of the Home tab (ADR 0062), apart from viewer-state.ts
// so that both can import it.

export interface ExamplesState {
  // What the core offers, read once at start-up.
  offered: readonly ExampleSummary[];
  // The example whose name prompt is open on the Home tab, or null.
  copyingId: string | null;
}

export const NO_EXAMPLES: ExamplesState = { offered: [], copyingId: null };
