import type { UpdateIoChannelRequest, UpdateIoModuleRequest } from "@pantin/protocol";

// Turns the text of an edited cell into the request body. The text is only
// parsed: ranges and rules are the protocol's and the core's.

// "invalidNumber" names the field, so the message can say which one; "ignored"
// is a field that is not edited here.
export type IoEditParse<Request> =
  | { kind: "request"; request: Request }
  | { kind: "invalidNumber"; field: IoNumberField }
  | { kind: "ignored" };

const MODULE_NUMBER_FIELDS = ["port", "unitId", "watchdogMilliseconds"] as const;
export type IoNumberField = (typeof MODULE_NUMBER_FIELDS)[number] | "address";

const request = <Request>(value: Request): IoEditParse<Request> => ({
  kind: "request",
  request: value,
});
const IGNORED = { kind: "ignored" } as const;

// An empty field must not become 0, which could pass for a real address.
function integerOf(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function parseModuleEdit(field: string, text: string): IoEditParse<UpdateIoModuleRequest> {
  if (field === "key") {
    return request({ key: text.trim() });
  }
  if (field === "wordOrder") {
    return text === "low_word_first" || text === "high_word_first"
      ? request({ wordOrder: text })
      : IGNORED;
  }
  const numeric = MODULE_NUMBER_FIELDS.find((name) => name === field);
  if (numeric === undefined) {
    return IGNORED;
  }
  const value = integerOf(text);
  return value === null ? { kind: "invalidNumber", field: numeric } : request({ [numeric]: value });
}

export function parseChannelEdit(field: string, text: string): IoEditParse<UpdateIoChannelRequest> {
  switch (field) {
    case "variable":
      return request({ variable: text.trim() });
    case "comment":
      return request({ comment: text });
    case "address": {
      const value = integerOf(text);
      return value === null ? { kind: "invalidNumber", field } : request({ address: value });
    }
    default:
      return IGNORED;
  }
}
