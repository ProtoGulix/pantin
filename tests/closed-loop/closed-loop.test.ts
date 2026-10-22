import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type CoreApi, createCoreApi, pollUntil } from "./support/core-api.ts";
import { type CoreProcess, startCoreProcess } from "./support/core-process.ts";
import {
  connectModbusClient,
  type ModbusClient,
  realOfLowWordFirst,
} from "./support/modbus-client.ts";
import {
  copyPlcCylinderWithTwoModules,
  MODBUS_MODULE_KEY,
  OPCUA_GVL_NAME,
  OPCUA_MODULE_KEY,
  OPCUA_NODE_ID_PREFIX,
  OPCUA_VARIABLES,
  PANTIN_ID,
  TAG_EXTENDED_SENSOR,
  TAG_POSITION,
} from "./support/pantin-copy.ts";
import { type PlcServer, startPlcServer } from "./support/plc-server.ts";

// The closed loop of ADR 0065 point 14: the real core, the Modbus bridge and the OPC UA bridge
// as processes, a PLC stood in for by an OPC UA server in this process (the PLC program's
// variables) and by a raw Modbus client (the PLC reading the module). The cylinder is driven
// by a command written on the OPC UA server, and its feedback must come back on both links.

const bridgePython = process.env.PANTIN_BRIDGE_PYTHON;
const opcuaBridge = process.env.PANTIN_OPCUA_BRIDGE;
const CAN_RUN = bridgePython !== undefined && opcuaBridge !== undefined;
const TITLE = "the closed loop of both bridges";
// Shown only when the describe is skipped, so a passing run carries no noise.
const SKIPPED_TITLE = `${TITLE} (needs PANTIN_BRIDGE_PYTHON and PANTIN_OPCUA_BRIDGE: pnpm test sets them, after pnpm setup:python)`;
const LOOPBACK = "127.0.0.1";
const POSITION_TOLERANCE = 0.001;
const EXTENDED_POSITION = 0.125;
const STEP_TIMEOUT_MILLISECONDS = 30_000;

function nodeOf(variable: string): string {
  return `${OPCUA_NODE_ID_PREFIX}${OPCUA_GVL_NAME}.${variable}`;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, LOOPBACK, () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

let root = "";
let plc: PlcServer | undefined;
let core: CoreProcess | undefined;
let api: CoreApi | undefined;
let modbus: ModbusClient | undefined;
let modbusPort = 0;

function requireStarted<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("A previous step of the closed loop failed: the run stops there.");
  }
  return value;
}

async function modbusPosition(client: ModbusClient): Promise<number> {
  return realOfLowWordFirst(await client.readInputRegisters(0, 2));
}

async function setUp(): Promise<void> {
  root = await mkdtemp(join(tmpdir(), "pantin-closed-loop-"));
  const pantinsDirectory = join(root, "pantins");
  await mkdir(pantinsDirectory);
  plc = await startPlcServer(join(root, "plc-pki"), [
    { identifier: nodeOf(OPCUA_VARIABLES.extend), dataType: "Boolean" },
    { identifier: nodeOf(OPCUA_VARIABLES.retract), dataType: "Boolean" },
    { identifier: nodeOf(OPCUA_VARIABLES.extended), dataType: "Boolean" },
    { identifier: nodeOf(OPCUA_VARIABLES.position), dataType: "Float" },
  ]);
  modbusPort = await freePort();
  await copyPlcCylinderWithTwoModules({ pantinsDirectory, modbusPort, opcuaPort: plc.port });
  core = await startCoreProcess({
    pantinsDirectory,
    pkiDirectory: join(root, "pki"),
    bridgePython: requireStarted(bridgePython),
    opcuaBridge: requireStarted(opcuaBridge),
  });
  api = createCoreApi(core.baseUrl, PANTIN_ID);
}

// Each stop runs even if an earlier one fails, so that no child outlives the run.
async function tearDown(): Promise<void> {
  modbus?.close();
  try {
    await core?.stop();
  } finally {
    try {
      await plc?.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function checkMapping(): Promise<void> {
  const mapping = await requireStarted(api).io();

  expect(mapping.status).toBe("valid");
  const opcuaModule = mapping.modules.find((module) => module.key === OPCUA_MODULE_KEY);
  const identifiers = opcuaModule?.channels.map((channel) => channel.opcua?.resolvedIdentifier);
  expect(identifiers).toContain(`s=${nodeOf(OPCUA_VARIABLES.extend)}`);
}

async function startModbusBridge(): Promise<void> {
  const coreApi = requireStarted(api);
  await coreApi.putBridge("modbus_tcp_slave", { running: true, listen: LOOPBACK, allow: [] });
  const running = await coreApi.waitForBridge(
    "modbus_tcp_slave",
    "ran",
    (status) => status.state === "running",
  );
  expect(running.modules.map((module) => module.key)).toEqual([MODBUS_MODULE_KEY]);

  // The module counts a PLC from its first request, not from the TCP handshake.
  modbus = await connectModbusClient(LOOPBACK, modbusPort, 1);
  await modbus.readDiscreteInputs(0, 2);
  await coreApi.waitForBridge("modbus_tcp_slave", "saw the PLC", (status) =>
    status.modules.every((module) => module.plcConnected),
  );
}

async function startOpcuaBridgeThroughTrust(): Promise<void> {
  const coreApi = requireStarted(api);
  const targets = { [OPCUA_MODULE_KEY]: LOOPBACK };
  await coreApi.putBridge("opcua_client", { running: true, targets });
  const failed = await coreApi.waitForBridge(
    "opcua_client",
    "refused the certificate",
    (status) => status.state === "failed",
  );
  expect(failed.failure?.kind).toBe("untrusted_server_certificate");
  const sha256 = failed.failure?.certificate?.sha256;
  if (sha256 === undefined) {
    throw new Error(`The failure names no server certificate: ${JSON.stringify(failed)}`);
  }

  await coreApi.putBridge("opcua_client", { running: true, targets, trust: [sha256] });
  // The PLC side now knows nothing of Pantin: it rejects the certificate.
  const rejected = await coreApi.waitForBridge(
    "opcua_client",
    "was rejected by the PLC",
    (status) => status.modules.some((module) => module.reason === "certificate_rejected"),
  );
  const clientCertificate =
    rejected.transport === "opcua_client" ? rejected.clientCertificate : null;
  if (clientCertificate === null) {
    throw new Error(`The status names no client certificate: ${JSON.stringify(rejected)}`);
  }

  await requireStarted(plc).trustRejectedClient(clientCertificate.sha256);
  // The bridge tries again by itself, every 10 s for this reason (ADR 0065 point 10).
  const running = await coreApi.waitForBridge(
    "opcua_client",
    "connected the PLC",
    (status) => status.state === "running" && status.modules.every((module) => module.plcConnected),
  );
  expect(running.modules.map((module) => module.key)).toEqual([OPCUA_MODULE_KEY]);
}

function isNear(value: number, expected: number): boolean {
  return Math.abs(value - expected) < POSITION_TOLERANCE;
}

async function extendOnOpcuaCommand(): Promise<void> {
  const server = requireStarted(plc);
  const client = requireStarted(modbus);
  const coreApi = requireStarted(api);
  await coreApi.startClock();

  server.set(nodeOf(OPCUA_VARIABLES.extend), 1);

  await server.until(nodeOf(OPCUA_VARIABLES.extended), (value) => value === 1);
  await pollUntil(
    "the extended sensor on Modbus",
    () => client.readDiscreteInputs(0, 2),
    ([retracted, extended]) => retracted === false && extended === true,
  );
  await pollUntil(
    "the position on Modbus",
    () => modbusPosition(client),
    (position) => isNear(position, EXTENDED_POSITION),
  );
  expect(await coreApi.tagValue(TAG_EXTENDED_SENSOR)).toBe(1);
  expect(isNear(await coreApi.tagValue(TAG_POSITION), EXTENDED_POSITION)).toBe(true);
  expect(isNear(server.current(nodeOf(OPCUA_VARIABLES.position)), EXTENDED_POSITION)).toBe(true);
}

async function retractOnOpcuaCommand(): Promise<void> {
  const server = requireStarted(plc);
  const client = requireStarted(modbus);

  server.set(nodeOf(OPCUA_VARIABLES.extend), 0);
  server.set(nodeOf(OPCUA_VARIABLES.retract), 1);

  await pollUntil(
    "the retracted sensor on Modbus",
    () => client.readDiscreteInputs(0, 2),
    ([retracted, extended]) => retracted === true && extended === false,
  );
  await server.until(nodeOf(OPCUA_VARIABLES.extended), (value) => value === 0);
  await server.until(nodeOf(OPCUA_VARIABLES.position), (position) => isNear(position, 0));
  expect(isNear(await modbusPosition(client), 0)).toBe(true);
}

async function stopBothBridges(): Promise<void> {
  const coreApi = requireStarted(api);
  await coreApi.putBridge("opcua_client", { running: false });
  await coreApi.putBridge("modbus_tcp_slave", { running: false });
  for (const kind of ["opcua_client", "modbus_tcp_slave"] as const) {
    await coreApi.waitForBridge(kind, "stopped", (status) => status.state === "stopped");
  }
}

// The Modbus client comes after the trust flow, whose retry wait would leave it silent past the
// bridge's idle timeout (at least 5 s): the bridge then resets the connection by design, to free
// the slot of a vanished PLC. The steps share one running machine and run in order. Only a
// failed setup stops them (through requireStarted); after a failed step the next ones still run,
// against whatever state it left.
describe.skipIf(!CAN_RUN)(CAN_RUN ? TITLE : SKIPPED_TITLE, () => {
  beforeAll(setUp, STEP_TIMEOUT_MILLISECONDS);
  afterEach((context) => {
    if (context.task.result?.state === "fail") {
      process.stderr.write(
        `Core log tail after "${context.task.name}":\n${core?.logTail() ?? ""}\n`,
      );
    }
  });
  afterAll(tearDown, STEP_TIMEOUT_MILLISECONDS);
  it("maps the OPC UA channels onto the nodes the PLC publishes", checkMapping);
  it(
    "trusts the PLC, is rejected by it, then connects once the PLC trusts Pantin",
    startOpcuaBridgeThroughTrust,
    STEP_TIMEOUT_MILLISECONDS,
  );
  it("starts the Modbus bridge and counts a client as a PLC", startModbusBridge);
  it(
    "extends on an OPC UA command, with feedback on both links",
    extendOnOpcuaCommand,
    STEP_TIMEOUT_MILLISECONDS,
  );
  it(
    "retracts on the opposite command, with feedback on both links",
    retractOnOpcuaCommand,
    STEP_TIMEOUT_MILLISECONDS,
  );
  it("stops both bridges", stopBothBridges);
});
