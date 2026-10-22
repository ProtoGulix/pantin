import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import type { TestPlcOptions } from "./plc-server.ts";
import type { FixtureModule } from "./projection-fixtures.ts";

// The security setting the process tests share: SignAndEncrypt with Basic256Sha256, on the
// server side and on the module side.

export const SECURE_SERVER = {
  variables: [
    { name: "plc_extend", dataType: "Boolean" },
    { name: "plc_out", dataType: "Boolean" },
  ],
  securityModes: [MessageSecurityMode.SignAndEncrypt],
  securityPolicies: [SecurityPolicy.Basic256Sha256],
} as const satisfies Omit<TestPlcOptions, "pkiFolder">;

export const SECURE_MODULE = {
  securityMode: "SignAndEncrypt",
  securityPolicy: "Basic256Sha256",
} as const satisfies Omit<FixtureModule, "key" | "port">;
