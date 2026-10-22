import type { SkipReason, SymbolWarning } from "@pantin/protocol";
import { isMessageKey, type Translate } from "../i18n/translate.ts";

// The wording of the notices of the PLC symbol import (ADR 0064): the core sends a code and
// the `values` its sentence interpolates, the translation files make the sentence (ADR 0010).
// A code without a label falls back to the core's English message. The codes are a closed list
// in the protocol, so a core with new codes needs a matching viewer.

const ACCESS_KEYS: Readonly<Record<string, "symbols.access.write" | "symbols.access.read">> = {
  write: "symbols.access.write",
  read: "symbols.access.read",
};

// The codes whose `access` is a raw enum value of the core, said in words rather than shown as
// is. For `access_unknown` it is the file's own text, shown as it is.
const SPOKEN_ACCESS_CODES: ReadonlySet<string> = new Set([
  "opcua_command_not_readable",
  "opcua_feedback_not_writable",
]);

function spokenValues(
  notice: SymbolWarning | SkipReason,
  translate: Translate,
): Record<string, string> {
  const { values } = notice;
  const accessKey = SPOKEN_ACCESS_CODES.has(notice.code)
    ? ACCESS_KEYS[values["access"] ?? ""]
    : undefined;
  return accessKey === undefined ? { ...values } : { ...values, access: translate(accessKey) };
}

function noticeText(
  prefix: "symbols.warning" | "symbols.reason",
  notice: SymbolWarning | SkipReason,
  translate: Translate,
): string {
  const key = `${prefix}.${notice.code}`;
  return isMessageKey(key) ? translate(key, spokenValues(notice, translate)) : notice.message;
}

export function symbolWarningText(warning: SymbolWarning, translate: Translate): string {
  return noticeText("symbols.warning", warning, translate);
}

// A variable refused for one part of its dotted name says which whole reference it belongs to.
export function skipReasonText(reason: SkipReason, translate: Translate): string {
  const text = noticeText("symbols.reason", reason, translate);
  const { variable, reference } = reason.values;
  return reference === undefined || reference === variable
    ? text
    : `${text} ${translate("symbols.reason.partOf", { reference })}`;
}
