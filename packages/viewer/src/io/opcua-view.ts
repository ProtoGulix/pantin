import { TRANSPORT_LABELS } from "@pantin/transport-types/labels";
import {
  OPCUA_CLIENT_KIND,
  SECURITY_MODES,
  SECURITY_POLICIES,
  type TransportConfig,
} from "@pantin/transport-types/schemas";
import { createTranslator, type Language } from "../i18n/translate.ts";
import type { TransportViewSpec } from "./transport-view-spec.ts";

// The OPC UA client in the I/O view (ADR 0065 point 13): its settings, its columns, and the
// heading "Client OPC UA · port 4840 · Signer et chiffrer · Basic256Sha256 · anonyme".

function userNameOf(transport: TransportConfig): string {
  return transport.kind === OPCUA_CLIENT_KIND && transport.auth.kind === "user"
    ? transport.auth.userName
    : "";
}

// An empty name is the anonymous login: a user login without a name does not exist.
function authPatchOf(text: string): Record<string, unknown> {
  const userName = text.trim();
  return { auth: userName === "" ? { kind: "anonymous" } : { kind: "user", userName } };
}

export const OPCUA_VIEW: TransportViewSpec = {
  endpointSettings: ["port", "securityMode", "securityPolicy"],
  settings: [
    { name: "port", input: "integer" },
    { name: "endpointPath", input: "text" },
    { name: "securityMode", input: "choice", options: SECURITY_MODES },
    { name: "securityPolicy", input: "choice", options: SECURITY_POLICIES },
    { name: "userName", input: "text", readFrom: userNameOf, patchOf: authPatchOf },
    { name: "namespaceUri", input: "text" },
    { name: "nodeIdPrefix", input: "text" },
    { name: "gvlName", input: "text" },
    { name: "samplingMilliseconds", input: "integer" },
    { name: "publishingMilliseconds", input: "integer" },
    { name: "watchdogMilliseconds", input: "integer" },
  ],
  channelFields: ["resolvedIdentifier", "identifier", "iecType"],
  placeFields: ["resolvedIdentifier"],
  editableChannelFields: [],
  channelValueKey: (field, value) =>
    field === "identifier" ? (value === null ? "derived" : "explicit") : undefined,
};

/** The heading of an OPC UA module, after the transport's name. */
export function opcuaSubtitle(transport: TransportConfig, language: Language): string {
  if (transport.kind !== OPCUA_CLIENT_KIND) {
    return "";
  }
  const labels = TRANSPORT_LABELS.opcua_client[language];
  const translate = createTranslator(language);
  const text = (value: string) => labels.values[value] ?? value;
  const word = (value: string) => text(value).toLowerCase();
  const security =
    transport.securityMode === "None"
      ? [translate("io.opcua.noSecurity")]
      : [text(transport.securityMode), text(transport.securityPolicy)];
  const auth =
    transport.auth.kind === "user"
      ? `${word("user")} (${transport.auth.userName})`
      : word("anonymous");
  const port = `${(labels.settings.port ?? "port").toLowerCase()} ${transport.port}`;
  return [labels.name, port, ...security, auth].join(" · ");
}
