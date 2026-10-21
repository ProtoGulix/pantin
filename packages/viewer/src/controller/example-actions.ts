import { PantinApiError } from "../api-transport.ts";
import {
  exampleBeingCopied,
  withExamplePromptClosed,
  withExamplesListed,
} from "../example-state.ts";
import { describeFailure, errorMessage, type PanelMessage } from "../messages.ts";
import { withRequestFinished, withRequestStarted } from "../request-count.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The example Pantins of the Home tab (ADR 0062).

/** Read once at start-up: the core's examples folder does not change while it runs. */
export async function loadExamples(store: ViewerStore): Promise<void> {
  await store.run(
    () => store.ports.api.listExamples(),
    (current, examples) => withExamplesListed(current, examples),
  );
}

/** Says what to do for a refused copy; any other failure keeps its usual text. */
export function exampleCopyFailureMessage(error: unknown): PanelMessage {
  if (error instanceof PantinApiError && error.kind === "api") {
    if (error.code === "not_found") {
      return errorMessage("example.error.notFound", {}, error.message);
    }
    if (error.code === "conflict") {
      return errorMessage("example.error.conflict", {}, error.message);
    }
  }
  return describeFailure(error);
}

/** Copies the example whose prompt is open under `name`, then opens the copy. */
export async function copyExample(store: ViewerStore, name: string): Promise<boolean> {
  const example = exampleBeingCopied(store.state);
  if (example === undefined) {
    return false;
  }
  store.update(withRequestStarted(store.state));
  try {
    const response = await store.ports.api.copyExample(example.id, name);
    store.requestedPantinId = response.id;
    store.pendingImportFile = null;
    store.update(
      withExamplePromptClosed(withOpenPantin(withRequestFinished(store.state), response)),
    );
  } catch (error) {
    // The prompt stays open, with the typed name, so the user can correct and retry.
    store.update({
      ...withRequestFinished(store.state),
      message: exampleCopyFailureMessage(error),
    });
    return false;
  }
  await refreshPantinList(store);
  return true;
}
