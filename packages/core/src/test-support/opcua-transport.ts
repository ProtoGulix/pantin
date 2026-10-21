import type { TransportConfig } from "@pantin/protocol";

// An OPC UA client module's settings, complete and valid, for tests that need a module of
// that kind without going through the edit routes.
export function createOpcuaTransport(gvlName = "GVL_Pantin"): TransportConfig {
  return {
    kind: "opcua_client",
    port: 4840,
    endpointPath: "",
    securityMode: "None",
    securityPolicy: "None",
    auth: { kind: "anonymous" },
    namespaceUri: "urn:test",
    nodeIdPrefix: "|var|Test.Application.",
    gvlName,
    samplingMilliseconds: 20,
    publishingMilliseconds: 20,
    watchdogMilliseconds: 1000,
  };
}
