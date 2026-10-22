import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { OPCUAServer } from "node-opcua-server";

// An OPC UA server in this process, standing for the PLC: listening on 127.0.0.1 on a free
// port, with `|var|`-style string nodes in a custom namespace like CODESYS publishes them
// (ADR 0065 point 14). Its endpoints are node-opcua's defaults: None, Sign and SignAndEncrypt.

const WAIT_TIMEOUT_MILLISECONDS = 15_000;

export const PLC_NAMESPACE_URI = "urn:test:plc";

export type PlcVariable = {
  /** The node's string identifier, for example `|var|App.GVL_Pantin.opcua_extend`. */
  identifier: string;
  dataType: "Boolean" | "Float";
};

export type PlcServer = {
  port: number;
  /** The value a node holds: a boolean as 0 or 1. */
  current(identifier: string): number;
  /** A change made by the PLC program itself, a command. */
  set(identifier: string, value: number): void;
  /** Resolves when `predicate` holds for the node, at once if it already does. */
  until(identifier: string, predicate: (value: number) => boolean): Promise<void>;
  /** The operator's step: trusts the client certificate the server rejected, by its sha256. */
  trustRejectedClient(sha256: string): Promise<void>;
  stop(): Promise<void>;
};

// The server keeps its own PKI in a temporary folder and trusts no client by itself, like a PLC
// that has to be told to accept Pantin's certificate. Nothing is written to the user's
// configuration directory, where node-opcua's default manager would put it.
async function createServer(pkiFolder: string): Promise<{
  server: OPCUAServer;
  certificateManager: OPCUACertificateManager;
}> {
  const certificateManager = new OPCUACertificateManager({
    rootFolder: pkiFolder,
    automaticallyAcceptUnknownCertificate: false,
  });
  await certificateManager.initialize();
  // The user-certificate store defaults to the configuration directory too.
  const userCertificateManager = new OPCUACertificateManager({
    rootFolder: `${pkiFolder}-users`,
    automaticallyAcceptUnknownCertificate: false,
  });
  await userCertificateManager.initialize();
  const server = new OPCUAServer({
    host: "127.0.0.1",
    port: 0,
    serverCertificateManager: certificateManager,
    userCertificateManager,
  });
  await server.initialize();
  return { server, certificateManager };
}

function normalizedThumbprint(thumbprint: string): string {
  return thumbprint.replaceAll(/[^0-9a-f]/gi, "").toLowerCase();
}

// Moves the rejected client certificate with this thumbprint to the trusted ones, as an
// operator does in the PLC's certificate list. Fails when the server never rejected it.
async function trustRejectedCertificate(
  certificateManager: OPCUACertificateManager,
  pkiFolder: string,
  sha256: string,
): Promise<void> {
  const rejectedFolder = join(pkiFolder, "rejected");
  const wanted = normalizedThumbprint(sha256);
  for (const fileName of await readdir(rejectedFolder)) {
    const content = await readFile(join(rejectedFolder, fileName));
    // Rejected certificates are stored as PEM; the manager wants the DER bytes.
    const der = Buffer.from(
      content.toString("utf8").replaceAll(/-----[A-Z ]+-----|\s/g, ""),
      "base64",
    );
    if (createHash("sha256").update(der).digest("hex") === wanted) {
      await certificateManager.trustCertificate(der);
      return;
    }
  }
  throw new Error(`The test server rejected no certificate with sha256 ${sha256}.`);
}

// node-opcua-address-space is not a direct dependency, so its types are reached through the server.
type AddressSpace = NonNullable<OPCUAServer["engine"]["addressSpace"]>;
type VariableNode = ReturnType<ReturnType<AddressSpace["registerNamespace"]>["addVariable"]>;

function addVariables(
  server: OPCUAServer,
  variables: readonly PlcVariable[],
  onChange: () => void,
): Map<string, VariableNode> {
  const addressSpace = server.engine.addressSpace;
  if (addressSpace === null) {
    throw new Error("The test server has no address space.");
  }
  const namespace = addressSpace.registerNamespace(PLC_NAMESPACE_URI);
  const nodes = new Map<string, VariableNode>();
  for (const variable of variables) {
    const node = namespace.addVariable({
      nodeId: `s=${variable.identifier}`,
      browseName: variable.identifier,
      dataType: variable.dataType,
      organizedBy: addressSpace.rootFolder.objects,
      minimumSamplingInterval: 10,
      accessLevel: "CurrentRead | CurrentWrite",
      userAccessLevel: "CurrentRead | CurrentWrite",
      value: { dataType: variable.dataType, value: variable.dataType === "Boolean" ? false : 0 },
    });
    node.on("value_changed", onChange);
    nodes.set(variable.identifier, node);
  }
  return nodes;
}

export async function startPlcServer(
  pkiFolder: string,
  variables: readonly PlcVariable[],
): Promise<PlcServer> {
  const { server, certificateManager } = await createServer(pkiFolder);
  const listeners = new Set<() => void>();
  const nodes = addVariables(server, variables, () => {
    for (const listener of [...listeners]) {
      listener();
    }
  });
  await server.start();
  const find = (identifier: string): VariableNode => {
    const node = nodes.get(identifier);
    if (node === undefined) {
      throw new Error(`The test server has no variable ${identifier}.`);
    }
    return node;
  };
  const current = (identifier: string): number => Number(find(identifier).readValue().value.value);
  return {
    port: Number(new URL(server.getEndpointUrl()).port),
    current,
    set: (identifier, value) => {
      const node = find(identifier);
      const isBoolean = typeof node.readValue().value.value === "boolean";
      node.setValueFromSource({
        dataType: isBoolean ? "Boolean" : "Float",
        value: isBoolean ? value !== 0 : value,
      });
    },
    until: (identifier, predicate) =>
      new Promise((resolve, reject) => {
        const finish = (): void => {
          clearTimeout(timeout);
          listeners.delete(check);
        };
        const timeout = setTimeout(() => {
          finish();
          reject(
            new Error(
              `Timed out waiting for ${identifier}; last value: ${String(current(identifier))}`,
            ),
          );
        }, WAIT_TIMEOUT_MILLISECONDS);
        const check = (): void => {
          if (predicate(current(identifier))) {
            finish();
            resolve();
          }
        };
        listeners.add(check);
        check();
      }),
    trustRejectedClient: (sha256) =>
      trustRejectedCertificate(certificateManager, pkiFolder, sha256),
    stop: () => server.shutdown(0),
  };
}
