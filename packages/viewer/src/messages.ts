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
}

export function errorMessage(
  key: MessageKey,
  parameters: MessageParameters = {},
  detail: string | null = null,
  links: readonly DeviceRef[] = [],
): PanelMessage {
  return { level: "error", key, parameters, detail, links };
}

export function infoMessage(key: MessageKey, parameters: MessageParameters = {}): PanelMessage {
  return { level: "info", key, parameters, detail: null, links: [] };
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
