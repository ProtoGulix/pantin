import type { OpcuaClientTransport } from "@pantin/protocol";
import {
  MessageSecurityMode,
  OPCUAClient,
  SecurityPolicy,
  type UserIdentityInfo,
  UserTokenType,
} from "node-opcua-client";
import type { ModulePlan } from "../module-plan.ts";
import type { Pki } from "./pki.ts";

// How the bridge builds node-opcua clients (ADR 0065 points 2, 5 and 10).

export const SECURITY_MODES: Readonly<
  Record<OpcuaClientTransport["securityMode"], MessageSecurityMode>
> = {
  None: MessageSecurityMode.None,
  Sign: MessageSecurityMode.Sign,
  SignAndEncrypt: MessageSecurityMode.SignAndEncrypt,
};

export const SECURITY_POLICIES: Readonly<
  Record<OpcuaClientTransport["securityPolicy"], SecurityPolicy>
> = {
  None: SecurityPolicy.None,
  Basic256Sha256: SecurityPolicy.Basic256Sha256,
  Aes128_Sha256_RsaOaep: SecurityPolicy.Aes128_Sha256_RsaOaep,
  Aes256_Sha256_RsaPss: SecurityPolicy.Aes256_Sha256_RsaPss,
};

// A single attempt per connect: with `maxRetry: 0` the client neither retries a failed connect
// nor repairs a lost connection by itself (it reports `connection_lost` and `close`).
const NO_AUTOMATIC_RETRY = { maxRetry: 0, initialDelay: 100, maxDelay: 100 } as const;

export function identityOf(login: ModulePlan["login"]): UserIdentityInfo {
  return login.kind === "anonymous"
    ? { type: UserTokenType.Anonymous }
    : { type: UserTokenType.UserName, userName: login.userName, password: login.password };
}

export function createClient(module: ModulePlan, pki: Pki): OPCUAClient {
  return OPCUAClient.create({
    applicationName: "Pantin OPC UA bridge",
    applicationUri: pki.applicationUri,
    clientName: `pantin-${module.key}`,
    clientCertificateManager: pki.certificateManager,
    certificateFile: pki.certificateFile,
    securityMode: SECURITY_MODES[module.transport.securityMode],
    securityPolicy: SECURITY_POLICIES[module.transport.securityPolicy],
    // The PLC may advertise a host name this machine cannot resolve; the target is the address
    // the user gave, and the hosts of the server's endpoint URLs are ignored (point 8).
    endpointMustExist: false,
    connectionStrategy: NO_AUTOMATIC_RETRY,
  });
}
