import type { UpdateIoChannelRequest, UpdateIoModuleRequest } from "@pantin/protocol";
import { CHANNEL_KEY_BY_KIND, type TransportKind } from "@pantin/transport-types/schemas";
import { isEditableChannelField, settingSpecOf } from "./io-transport-view.ts";

// Turns the text of an edited cell into the request body. The text is only
// parsed: ranges and rules are the protocol's and the core's.

// "invalidNumber" names the field, so the message can say which one; "ignored"
// is a field that is not edited here.
export type IoEditParse<Request> =
  | { kind: "request"; request: Request }
  | { kind: "invalidNumber"; field: string }
  | { kind: "ignored" };

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

// A setting of the module's transport, whose names are the transport's own. The cast is only for
// the computed key: the api client validates the body against the Zod schema before sending it.
function transportSetting(
  kind: TransportKind,
  field: string,
  value: string | number,
): IoEditParse<UpdateIoModuleRequest> {
  return request({ transport: { kind, [field]: value } } as UpdateIoModuleRequest);
}

export function parseModuleEdit(
  kind: TransportKind,
  field: string,
  text: string,
): IoEditParse<UpdateIoModuleRequest> {
  if (field === "key") {
    return request({ key: text.trim() });
  }
  const spec = settingSpecOf(kind, field);
  if (spec === undefined) {
    return IGNORED;
  }
  if (spec.input === "choice") {
    return spec.options?.includes(text) === true ? transportSetting(kind, field, text) : IGNORED;
  }
  const value = integerOf(text);
  return value === null ? { kind: "invalidNumber", field } : transportSetting(kind, field, value);
}

export function parseChannelEdit(
  kind: TransportKind,
  field: string,
  text: string,
): IoEditParse<UpdateIoChannelRequest> {
  switch (field) {
    case "variable":
      return request({ variable: text.trim() });
    case "comment":
      return request({ comment: text });
    default: {
      if (!isEditableChannelField(kind, field)) {
        return IGNORED;
      }
      const value = integerOf(text);
      // Same cast: the patch sub-object is named after the transport (ADR 0064 point 4).
      return value === null
        ? { kind: "invalidNumber", field }
        : request({ [CHANNEL_KEY_BY_KIND[kind]]: { [field]: value } } as UpdateIoChannelRequest);
    }
  }
}
