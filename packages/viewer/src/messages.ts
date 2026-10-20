import type { ApiErrorCode } from "@pantin/protocol";
import { PantinApiError } from "./api-transport.ts";
import type { DeviceRef } from "./device-selection.ts";
import type { MessageKey, MessageParameters } from "./i18n/translate.ts";

// The one message line of the panel. Stored untranslated (key + parameters),
// so that switching language also translates the message on screen.

export type MessageLevel = "error" | "info";

export interface PanelMessage {
  level: MessageLevel;
  key: MessageKey;
  parameters: MessageParameters;
  // Technical detail in English or language-neutral identifiers (tag names),
  // from the core or the browser, shown under the translated text, never
  // alone (ADR 0010).
  detail: string | null;
  // Devices the message names, shown as links that select them (ADR 0030
  // point 4). Kept as references: their names are read from the document.
  links: readonly DeviceRef[];
  // Offers a "Retry" action that loads again the meshes which failed to load.
  retryMeshLoad: boolean;
}

export function errorMessage(
  key: MessageKey,
  parameters: MessageParameters = {},
  detail: string | null = null,
  links: readonly DeviceRef[] = [],
): PanelMessage {
  return { level: "error", key, parameters, detail, links, retryMeshLoad: false };
}

export function meshLoadMessage(bodyName: string, reason: string): PanelMessage {
  return { ...errorMessage("message.meshLoad", { name: bodyName }, reason), retryMeshLoad: true };
}

export function infoMessage(key: MessageKey, parameters: MessageParameters = {}): PanelMessage {
  return { level: "info", key, parameters, detail: null, links: [], retryMeshLoad: false };
}

function apiErrorKey(code: ApiErrorCode): MessageKey {
  return `error.code.${code}`;
}

function keyOfApiError(error: PantinApiError): MessageKey {
  switch (error.kind) {
    case "network":
      return "error.network";
    case "invalid_response":
      return "error.invalidResponse";
    case "invalid_input":
      return "error.invalidInput";
    case "api":
      return error.code === null ? "error.unexpected" : apiErrorKey(error.code);
  }
}

/** Every failure becomes a translated, actionable message; nothing is hidden. */
export function describeFailure(error: unknown): PanelMessage {
  if (error instanceof PantinApiError) {
    return errorMessage(keyOfApiError(error), {}, error.message);
  }
  return errorMessage(
    "error.unexpected",
    {},
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * The core words its refusals of a command (grouping, frame alignment) as final sentences naming the
 * joint, body or item in the way: they are shown as they are, not behind the
 * generic text of the error code. Any other failure keeps its usual message.
 */
export function coreRefusalMessage(error: unknown): PanelMessage {
  const refused =
    error instanceof PantinApiError &&
    error.kind === "api" &&
    (error.code === "conflict" || error.code === "not_found" || error.code === "invalid_request");
  return refused
    ? errorMessage("message.coreRefused", { reason: error.message })
    : describeFailure(error);
}
