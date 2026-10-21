import { z } from "zod";
import { OPCUA_IEC_TYPES } from "./iec-types.ts";

// The OPC UA client transport (ADR 0065): Pantin is a client of the PLC's OPC UA server and
// one module is one session. Data only: the protocol imports this file, so it never reaches
// the rules (ADR 0064 point 3). No host and no password here: the PLC's address is chosen at
// each start and a password lives in the core's memory (ADR 0065 points 8 and 9).

export const OPCUA_CLIENT_KIND = "opcua_client";

export const SECURITY_MODES = ["None", "Sign", "SignAndEncrypt"] as const;
export const SecurityModeSchema = z.enum(SECURITY_MODES);
export type SecurityMode = z.infer<typeof SecurityModeSchema>;

// The deprecated Basic128Rsa15 and Basic256 are not offered.
export const SECURITY_POLICIES = [
  "None",
  "Basic256Sha256",
  "Aes128_Sha256_RsaOaep",
  "Aes256_Sha256_RsaPss",
] as const;
export const SecurityPolicySchema = z.enum(SECURITY_POLICIES);
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

export const OpcuaIecTypeSchema = z.enum(OPCUA_IEC_TYPES);

export const OPCUA_DEFAULT_PORT = 4840;
export const OPCUA_DEFAULT_SECURITY_MODE: SecurityMode = "SignAndEncrypt";
export const OPCUA_DEFAULT_SECURITY_POLICY: SecurityPolicy = "Basic256Sha256";
// NOT VERIFIED (spike 0012): the NodeId of a CODESYS variable. The guide tells the user to
// check it against the PLC.
export const OPCUA_DEFAULT_NODE_ID_PREFIX = "|var|CODESYS Control Win V3 x64.Application.";
export const OPCUA_DEFAULT_GVL_NAME = "GVL_Pantin";
export const OPCUA_DEFAULT_SAMPLING_MILLISECONDS = 20;
export const OPCUA_DEFAULT_PUBLISHING_MILLISECONDS = 20;
export const OPCUA_DEFAULT_WATCHDOG_MILLISECONDS = 1000;
export const OPCUA_TEXT_MAX_LENGTH = 255;

// An IEC identifier (ADR 0045 point 9). The reserved words are the core's list: a keyword
// as a GVL name is left to the PLC to refuse.
const GVL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/;
const GVL_NAME_MAX_LENGTH = 64;

const PortSchema = z.number().int().min(1).max(65535);
const TextSchema = z.string().max(OPCUA_TEXT_MAX_LENGTH);
const EndpointPathSchema = TextSchema.refine((path) => path === "" || path.startsWith("/"), {
  message: 'An endpoint path is empty or starts with "/".',
});
const GvlNameSchema = z.string().max(GVL_NAME_MAX_LENGTH).regex(GVL_NAME_PATTERN, {
  message:
    "A GVL name starts with a letter, then holds letters, digits and single underscores, with no leading, trailing or double underscore.",
});
const SamplingSchema = z.number().int().min(0).max(10_000);
const PublishingSchema = z.number().int().min(10).max(60_000);
const WatchdogSchema = z.number().int().min(100).max(3_600_000);
const IdentifierSchema = z.string().min(1).max(OPCUA_TEXT_MAX_LENGTH);

export const OpcuaAuthSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("anonymous") }),
  z.strictObject({
    kind: z.literal("user"),
    userName: z.string().min(1).max(OPCUA_TEXT_MAX_LENGTH),
  }),
]);
export type OpcuaAuth = z.infer<typeof OpcuaAuthSchema>;

const ANONYMOUS: OpcuaAuth = { kind: "anonymous" };

/**
 * The settings of a module in io.json. `securityMode` is `None` exactly when
 * `securityPolicy` is: a hand edit that breaks the pair is the problem
 * `security_mismatch`, not an unreadable file.
 */
export const OpcuaClientTransportSchema = z.strictObject({
  kind: z.literal(OPCUA_CLIENT_KIND),
  port: PortSchema.default(OPCUA_DEFAULT_PORT),
  endpointPath: EndpointPathSchema.default(""),
  securityMode: SecurityModeSchema.default(OPCUA_DEFAULT_SECURITY_MODE),
  securityPolicy: SecurityPolicySchema.default(OPCUA_DEFAULT_SECURITY_POLICY),
  auth: OpcuaAuthSchema.default(ANONYMOUS),
  namespaceUri: TextSchema.default(""),
  nodeIdPrefix: TextSchema.default(OPCUA_DEFAULT_NODE_ID_PREFIX),
  gvlName: GvlNameSchema.default(OPCUA_DEFAULT_GVL_NAME),
  samplingMilliseconds: SamplingSchema.default(OPCUA_DEFAULT_SAMPLING_MILLISECONDS),
  publishingMilliseconds: PublishingSchema.default(OPCUA_DEFAULT_PUBLISHING_MILLISECONDS),
  watchdogMilliseconds: WatchdogSchema.default(OPCUA_DEFAULT_WATCHDOG_MILLISECONDS),
});
export type OpcuaClientTransport = z.infer<typeof OpcuaClientTransportSchema>;

/** The edit requests: an absent setting means "unchanged" (or "proposed" on creation). */
export const OpcuaClientPatchSchema = z.strictObject({
  kind: z.literal(OPCUA_CLIENT_KIND),
  port: PortSchema.optional(),
  endpointPath: EndpointPathSchema.optional(),
  securityMode: SecurityModeSchema.optional(),
  securityPolicy: SecurityPolicySchema.optional(),
  auth: OpcuaAuthSchema.optional(),
  namespaceUri: TextSchema.optional(),
  nodeIdPrefix: TextSchema.optional(),
  gvlName: GvlNameSchema.optional(),
  samplingMilliseconds: SamplingSchema.optional(),
  publishingMilliseconds: PublishingSchema.optional(),
  watchdogMilliseconds: WatchdogSchema.optional(),
});
export type OpcuaClientPatch = z.infer<typeof OpcuaClientPatchSchema>;

// `identifier` null means derived by the core (ADR 0065 point 3). A string is an explicit
// NodeId in `namespaceUri` (`s=...` or `i=...`), for servers other than CODESYS.
export const OpcuaChannelSchema = z.strictObject({
  identifier: IdentifierSchema.nullable(),
  iecType: OpcuaIecTypeSchema,
});
export type OpcuaChannel = z.infer<typeof OpcuaChannelSchema>;

/** The channel as the core answers GET .../io: the identifier the bridge will use. */
export const OpcuaMappedChannelSchema = z.strictObject({
  ...OpcuaChannelSchema.shape,
  resolvedIdentifier: z.string(),
});
export type OpcuaMappedChannel = z.infer<typeof OpcuaMappedChannelSchema>;

export const OpcuaChannelPatchSchema = z.strictObject({
  identifier: IdentifierSchema.nullable().optional(),
  iecType: OpcuaIecTypeSchema.optional(),
});
export type OpcuaChannelPatch = z.infer<typeof OpcuaChannelPatchSchema>;

export const OPCUA_PROBLEM_CODES = [
  "security_mismatch",
  "namespace_missing",
  "identifier_invalid",
  "iec_type_mismatch",
  "gvl_name_mismatch",
] as const;
