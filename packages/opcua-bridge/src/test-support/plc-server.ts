import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import {
  DataType,
  MessageSecurityMode,
  SecurityPolicy,
  Variant,
  VariantArrayType,
} from "node-opcua-client";
import { OPCUAServer } from "node-opcua-server";
import type { Pki } from "../opcua/pki.ts";
import { type DataTypeName, int64ToWords, wordsToInt64 } from "../signal-values.ts";

// An OPC UA server in this process, standing for the PLC (ADR 0065 point 14): listening on
// 127.0.0.1 only, on a free port, with temporary certificate folders, and `|var|`-style string
// nodes in a custom namespace like CODESYS publishes them.

const TEST_NAMESPACE_URI = "urn:test:plc";
const TEST_NODE_PREFIX = "|var|App.GVL_Pantin.";

const DATA_TYPES: Readonly<Record<DataTypeName, DataType>> = {
  Boolean: DataType.Boolean,
  Float: DataType.Float,
  Double: DataType.Double,
  Int16: DataType.Int16,
  Int32: DataType.Int32,
  Int64: DataType.Int64,
};

export type TestVariable = {
  name: string;
  dataType: DataTypeName;
  /** Booleans as 0 or 1, like the bridge's tag values. */
  initial?: number;
  /** "readwrite" by default. */
  access?: "read" | "readwrite";
};

export type TestPlcOptions = {
  /** A folder for the server's own certificates. */
  pkiFolder: string;
  variables: readonly TestVariable[];
  securityModes?: readonly MessageSecurityMode[];
  securityPolicies?: readonly SecurityPolicy[];
  /** Name to password. Anonymous access is refused when this is given. */
  users?: Readonly<Record<string, string>>;
  maxNodesPerWrite?: number;
  /** Items beyond this count are refused one by one when the bridge creates its subscription. */
  maxMonitoredItemsPerSubscription?: number;
  /** Extra namespaces registered before the test one, to move its index. */
  extraNamespaceUris?: readonly string[];
  /** A fixed port, to start a server again where the previous one was. */
  port?: number;
  /** Replaces the server's certificate by one made with its own key, to test bad certificates. */
  certificate?: TestServerCertificate;
};

/** What the replacement certificate gets wrong: when it is valid, or whose it says it is. */
type TestServerCertificate = {
  startDate: Date;
  validityDays: number;
  /** The server's own URI is `urn:test:plc-server`; another one makes a mismatch. */
  applicationUri?: string;
};

export type TestPlcServer = {
  port: number;
  /** `opc.tcp://127.0.0.1:<port>`, the address the bridge dials (the server advertises its host name). */
  endpointUrl: string;
  /** The value a node holds, as a tag number. */
  current(name: string): number;
  /** A change made by the PLC program itself (a command). */
  set(name: string, value: number): void;
  /** Every change of every node, in order, whoever made it. */
  changes: Array<{ name: string; value: number }>;
  /** Resolves when `predicate` holds for the node, at once if it already does. */
  until(name: string, predicate: (value: number) => boolean): Promise<void>;
  /** Makes the server accept this client certificate (PEM text of Pantin's certificate). */
  trustClient(clientCertificatePem: Buffer): Promise<void>;
  /** The server's certificate, as the DER bytes a client trusts. */
  certificateDer(): Buffer;
  /** Resolves when the server receives its first request of this type (for example "ReadRequest"). */
  firstRequest(typeName: string): Promise<void>;
  stop(): Promise<void>;
};

function numberOf(variant: Variant): number {
  const value: unknown = variant.value; // node-opcua types the payload as `any`
  if (Array.isArray(value)) {
    return wordsToInt64(Number(value[0]), Number(value[1]));
  }
  return Number(value);
}

function variantOf(variable: TestVariable, value: number): Variant {
  if (variable.dataType === "Int64") {
    return new Variant({
      dataType: DataType.Int64,
      arrayType: VariantArrayType.Scalar,
      value: int64ToWords(value),
    });
  }
  return new Variant({
    dataType: DATA_TYPES[variable.dataType],
    value: variable.dataType === "Boolean" ? value !== 0 : value,
  });
}

async function createManager(rootFolder: string): Promise<OPCUACertificateManager> {
  const manager = new OPCUACertificateManager({ rootFolder });
  await manager.initialize();
  return manager;
}

const SERVER_APPLICATION_URI = "urn:test:plc-server";

// The server's key is the one its certificate manager created, so the new certificate fits it.
async function createCertificateFiles(
  manager: OPCUACertificateManager,
  certificate: TestServerCertificate,
): Promise<{ certificateFile: string; privateKeyFile: string }> {
  const certificateFile = join(manager.rootDir, "own", "certs", "replacement_certificate.pem");
  await manager.createSelfSignedCertificate({
    applicationUri: certificate.applicationUri ?? SERVER_APPLICATION_URI,
    dns: ["localhost"],
    outputFile: certificateFile,
    subject: "/CN=Test PLC server",
    startDate: certificate.startDate,
    validity: certificate.validityDays,
  });
  return {
    certificateFile,
    privateKeyFile: join(manager.rootDir, "own", "private", "private_key.pem"),
  };
}

type ServerParts = {
  server: OPCUAServer;
  serverCertificateManager: OPCUACertificateManager;
};

async function createServer(options: TestPlcOptions): Promise<ServerParts> {
  const serverCertificateManager = await createManager(join(options.pkiFolder, "server"));
  const userCertificateManager = await createManager(join(options.pkiFolder, "users"));
  const users = options.users;
  const files =
    options.certificate === undefined
      ? {}
      : await createCertificateFiles(serverCertificateManager, options.certificate);
  const server = new OPCUAServer({
    host: "127.0.0.1",
    port: options.port ?? 0,
    serverInfo: { applicationUri: SERVER_APPLICATION_URI },
    ...files,
    serverCertificateManager,
    userCertificateManager,
    securityModes: options.securityModes ? [...options.securityModes] : [MessageSecurityMode.None],
    securityPolicies: options.securityPolicies
      ? [...options.securityPolicies]
      : [SecurityPolicy.None],
    allowAnonymous: users === undefined,
    ...(users === undefined
      ? {}
      : {
          userManager: {
            isValidUser: (user: string, password: string) => users[user] === password,
          },
        }),
    serverCapabilities: {
      ...(options.maxNodesPerWrite === undefined
        ? {}
        : { operationLimits: { maxNodesPerWrite: options.maxNodesPerWrite } }),
      ...(options.maxMonitoredItemsPerSubscription === undefined
        ? {}
        : { maxMonitoredItemsPerSubscription: options.maxMonitoredItemsPerSubscription }),
    },
  });
  await server.initialize();
  return { server, serverCertificateManager };
}

// node-opcua-address-space is not a direct dependency, so its types are reached through the server.
type AddressSpace = NonNullable<OPCUAServer["engine"]["addressSpace"]>;
type UAVariable = ReturnType<ReturnType<AddressSpace["registerNamespace"]>["addVariable"]>;
type VariableNode = { variable: TestVariable; node: UAVariable };

// Registers the namespaces and the variables. `onChange` hears every change of every node.
function addVariables(
  server: OPCUAServer,
  options: TestPlcOptions,
  onChange: (name: string, value: number) => void,
): Map<string, VariableNode> {
  const addressSpace = server.engine.addressSpace;
  if (addressSpace === null) {
    throw new Error("The test server has no address space.");
  }
  for (const uri of options.extraNamespaceUris ?? []) {
    addressSpace.registerNamespace(uri);
  }
  const namespace = addressSpace.registerNamespace(TEST_NAMESPACE_URI);
  const nodes = new Map<string, VariableNode>();
  for (const variable of options.variables) {
    const access = variable.access === "read" ? "CurrentRead" : "CurrentRead | CurrentWrite";
    const node = namespace.addVariable({
      nodeId: `s=${TEST_NODE_PREFIX}${variable.name}`,
      browseName: variable.name,
      dataType: variable.dataType,
      organizedBy: addressSpace.rootFolder.objects,
      minimumSamplingInterval: 10,
      accessLevel: access,
      userAccessLevel: access,
      value: variantOf(variable, variable.initial ?? 0),
    });
    node.on("value_changed", (dataValue) => onChange(variable.name, numberOf(dataValue.value)));
    nodes.set(variable.name, { variable, node });
  }
  return nodes;
}

function firstRequestOf(server: OPCUAServer, typeName: string): Promise<void> {
  return new Promise((resolve) => {
    const listener = (request: object): void => {
      if (request.constructor.name === typeName) {
        server.off("request", listener);
        resolve();
      }
    };
    server.on("request", listener);
  });
}

export async function startTestPlcServer(options: TestPlcOptions): Promise<TestPlcServer> {
  const { server, serverCertificateManager } = await createServer(options);
  const changes: TestPlcServer["changes"] = [];
  const listeners = new Set<() => void>();
  const nodes = addVariables(server, options, (name, value) => {
    changes.push({ name, value });
    for (const listener of [...listeners]) {
      listener();
    }
  });
  await server.start();
  const port = Number(new URL(server.getEndpointUrl()).port);
  const find = (name: string): VariableNode => {
    const found = nodes.get(name);
    if (found === undefined) {
      throw new Error(`The test server has no variable ${name}.`);
    }
    return found;
  };
  const current = (name: string): number => numberOf(find(name).node.readValue().value);
  return {
    port,
    endpointUrl: `opc.tcp://127.0.0.1:${port}`,
    current,
    set: (name, value) => {
      const { variable, node } = find(name);
      node.setValueFromSource(variantOf(variable, value));
    },
    changes,
    until: (name, predicate) =>
      new Promise((resolve) => {
        const check = (): void => {
          if (predicate(current(name))) {
            listeners.delete(check);
            resolve();
          }
        };
        listeners.add(check);
        check();
      }),
    trustClient: async (pem) => {
      await serverCertificateManager.trustCertificate(new X509Certificate(pem).raw);
    },
    firstRequest: (typeName) => firstRequestOf(server, typeName),
    certificateDer: () => new X509Certificate(server.getCertificate()).raw,
    stop: () => server.shutdown(0),
  };
}

/**
 * Makes the bridge's client trust the test server's certificate, as `--trust` would, and the
 * server trust Pantin's: a secure channel needs both before any session opens.
 */
export async function trustEachOther(pki: Pki, server: TestPlcServer): Promise<void> {
  await pki.certificateManager.trustCertificate(server.certificateDer());
  await server.trustClient(await readFile(pki.certificateFile));
}
