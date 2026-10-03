import type { OrphanMeshDeletionResponse, OrphanMeshList } from "@pantin/protocol";
import { createTranslator, type Language, pluralKey } from "../i18n/translate.ts";
import { errorMessage, infoMessage, type PanelMessage } from "../messages.ts";

// What the orphan cleanup shows (ADR 0038 point 7): sizes, the lines under
// the prompt and the message after the deletion.

// Lines listed before "… et N autre(s)": a long list must not fill the screen.
const MAX_ORPHAN_DETAIL_LINES = 20;

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** Decimal units (1 ko = 1000 octets), as disks and file managers show them. */
export function formatFileSize(bytes: number, language: Language): string {
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1000 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: SIZE_UNITS[unitIndex] ?? "byte",
    unitDisplay: "short",
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);
}

export function orphanCleanupPromptText(list: OrphanMeshList, language: Language): string {
  const count = list.files.length;
  return createTranslator(language)(pluralKey("prompt.orphanCleanup.text", count, language), {
    count,
    size: formatFileSize(list.totalSizeInBytes, language),
  });
}

export function orphanCleanupDetails(list: OrphanMeshList, language: Language): string[] {
  const t = createTranslator(language);
  const lines = list.files
    .slice(0, MAX_ORPHAN_DETAIL_LINES)
    .map(({ fileName, sizeInBytes }) =>
      t("prompt.orphanCleanup.file", { fileName, size: formatFileSize(sizeInBytes, language) }),
    );
  const hidden = list.files.length - lines.length;
  return hidden > 0
    ? [...lines, t(pluralKey("prompt.orphanCleanup.more", hidden, language), { count: hidden })]
    : lines;
}

function failureDetail(failed: OrphanMeshDeletionResponse["failed"]): string {
  return failed.map(({ fileName, errorCode }) => `${fileName}: ${errorCode}`).join(", ");
}

// Failures first: an error is what the user must act on; the detail holds
// only file names and error codes, which are language-neutral.
function failureMessage(response: OrphanMeshDeletionResponse, language: Language): PanelMessage {
  const failed = response.failed.length;
  return errorMessage(
    pluralKey("message.orphanCleanup.failed", failed, language),
    { failed, deleted: response.deleted.length },
    failureDetail(response.failed),
  );
}

function deletedMessage(response: OrphanMeshDeletionResponse, language: Language): PanelMessage {
  const count = response.deleted.length;
  const parameters = {
    count,
    size: formatFileSize(
      response.deleted.reduce((total, { sizeInBytes }) => total + sizeInBytes, 0),
      language,
    ),
  };
  if (response.skipped.length === 0) {
    return infoMessage(pluralKey("message.orphanCleanup.deleted", count, language), parameters);
  }
  return {
    ...infoMessage(pluralKey("message.orphanCleanup.deletedSkipped", count, language), {
      ...parameters,
      skipped: response.skipped.length,
    }),
    detail: response.skipped.join(", "),
  };
}

/** The merged outcome of the deletion, as the one message line. */
export function orphanCleanupMessage(
  response: OrphanMeshDeletionResponse,
  language: Language,
): PanelMessage {
  return response.failed.length > 0
    ? failureMessage(response, language)
    : deletedMessage(response, language);
}
