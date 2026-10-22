import {
  type IoMappingResponse,
  IoMappingResponseSchema,
  type OpcuaClientTransport,
  OpcuaClientTransportSchema,
  type OpcuaIecType,
} from "@pantin/protocol";

// A projection of the mapping as `GET .../io?transport=opcua_client` answers it, parsed by the
// protocol schema so that a fixture that drifts from the contract fails at once.

export const FIXTURE_MAPPING_ID =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

// Nothing listens on it: a session test that must not reach a server connects here and is refused
// at once, instead of dialling a real address or a port a developer's own server may hold.
export const CLOSED_PORT = 1;

export type FixtureChannel = {
  tag: string;
  direction: "command" | "feedback";
  identifier: string;
  iecType?: OpcuaIecType;
};

export type FixtureModule = {
  key: string;
  // The login of the module; anonymous by default.
  userName?: string;
  endpointPath?: string;
  port?: number;
  namespaceUri?: string;
  securityMode?: OpcuaClientTransport["securityMode"];
  securityPolicy?: OpcuaClientTransport["securityPolicy"];
  samplingMilliseconds?: number;
  publishingMilliseconds?: number;
  watchdogMilliseconds?: number;
  // The two BOOL channels of a cylinder by default.
  channels?: readonly FixtureChannel[];
};

const SIGNAL_TYPE_OF_IEC_TYPE: Readonly<Record<OpcuaIecType, string>> = {
  BOOL: "bit",
  REAL: "float",
  LREAL: "float",
  INT: "integer",
  DINT: "integer",
  LINT: "integer",
};

function channel({ tag, direction, identifier, iecType = "BOOL" }: FixtureChannel) {
  return {
    tag,
    variable: tag.split(".").slice(-1).join(""),
    comment: "",
    opcua: { identifier: null, iecType, resolvedIdentifier: identifier },
    tagType: SIGNAL_TYPE_OF_IEC_TYPE[iecType],
    direction,
    owner: { kind: "drive", id: "valve" },
  };
}

function defaultChannels(key: string): FixtureChannel[] {
  return [
    {
      tag: "press.valve.extend",
      direction: "command",
      identifier: `s=|var|App.GVL_Pantin.${key}_extend`,
    },
    {
      tag: "press.cylinder.extended",
      direction: "feedback",
      identifier: `s=|var|App.GVL_Pantin.${key}_out`,
    },
  ];
}

export function opcuaProjection(
  modules: readonly FixtureModule[] = [{ key: "plc" }],
  overrides: Partial<IoMappingResponse> = {},
): IoMappingResponse {
  return IoMappingResponseSchema.parse({
    status: "valid",
    mappingId: FIXTURE_MAPPING_ID,
    modules: modules.map((module) => ({
      key: module.key,
      transport: OpcuaClientTransportSchema.parse({
        kind: "opcua_client",
        namespaceUri: module.namespaceUri ?? "urn:test:plc",
        endpointPath: module.endpointPath ?? "",
        ...(module.port === undefined ? {} : { port: module.port }),
        ...(module.securityMode === undefined ? {} : { securityMode: module.securityMode }),
        ...(module.securityPolicy === undefined ? {} : { securityPolicy: module.securityPolicy }),
        ...(module.samplingMilliseconds === undefined
          ? {}
          : { samplingMilliseconds: module.samplingMilliseconds }),
        ...(module.publishingMilliseconds === undefined
          ? {}
          : { publishingMilliseconds: module.publishingMilliseconds }),
        ...(module.watchdogMilliseconds === undefined
          ? {}
          : { watchdogMilliseconds: module.watchdogMilliseconds }),
        auth:
          module.userName === undefined
            ? { kind: "anonymous" }
            : { kind: "user", userName: module.userName },
      }),
      channels: (module.channels ?? defaultChannels(module.key)).map(channel),
    })),
    problems: [],
    unmappedTags: [],
    ...overrides,
  });
}
