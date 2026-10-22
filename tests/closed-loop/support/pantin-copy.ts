import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type IoDocument, IoDocumentSchema } from "@pantin/protocol";
import { PLC_NAMESPACE_URI } from "./plc-server.ts";

// A copy of examples/plc-cylinder whose io.json holds one Modbus module and one OPC UA module,
// as the viewer would leave it after the user mapped the tags. The file is written before the
// core starts, so that the core reads it as any file edited with Pantin closed (ADR 0063).

export const PANTIN_ID = "plc-cylinder";
export const MODBUS_MODULE_KEY = "m1";
export const OPCUA_MODULE_KEY = "o1";
export const OPCUA_NODE_ID_PREFIX = "|var|App.";
export const OPCUA_GVL_NAME = "GVL_Pantin";

const TAG_EXTEND_COMMAND = "verin1.verin1.coil_14";
const TAG_RETRACT_COMMAND = "verin1.verin1.coil_12";
const TAG_RETRACTED_SENSOR = "tige.verin-min.state";
export const TAG_EXTENDED_SENSOR = "tige.verin-max.state";
export const TAG_POSITION = "tige.verin.position";

/** The variables the PLC program declares in its GVL, named differently from the Modbus ones. */
export const OPCUA_VARIABLES = {
  extend: "opcua_extend",
  retract: "opcua_retract",
  extended: "opcua_extended",
  position: "opcua_position",
} as const;

const EXAMPLE_FOLDER = join(import.meta.dirname, "../../../examples/plc-cylinder");

type CopyOptions = {
  pantinsDirectory: string;
  modbusPort: number;
  opcuaPort: number;
};

function opcuaChannel(tag: string, variable: string, iecType: "BOOL" | "REAL") {
  return { tag, variable, comment: "", opcua: { identifier: null, iecType } };
}

function modbusChannel(
  tag: string,
  variable: string,
  zone: "discrete_input" | "input_register",
  address: number,
  ioType: "BOOL" | "REAL",
) {
  return { tag, variable, comment: "", modbus: { zone, address, ioType } };
}

// Commands come from the OPC UA module only (a command is mapped once). The feedbacks of the
// extended end and of the position are mapped in both modules, which is the point of the test.
function buildDocument(options: CopyOptions): IoDocument {
  return IoDocumentSchema.parse({
    schema_version: 2,
    modules: [
      {
        key: MODBUS_MODULE_KEY,
        transport: {
          kind: "modbus_tcp_slave",
          port: options.modbusPort,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 5000,
        },
        channels: [
          modbusChannel(TAG_RETRACTED_SENSOR, "modbus_retracted", "discrete_input", 0, "BOOL"),
          modbusChannel(TAG_EXTENDED_SENSOR, "modbus_extended", "discrete_input", 1, "BOOL"),
          modbusChannel(TAG_POSITION, "modbus_position", "input_register", 0, "REAL"),
        ],
      },
      {
        key: OPCUA_MODULE_KEY,
        transport: {
          kind: "opcua_client",
          port: options.opcuaPort,
          securityMode: "SignAndEncrypt",
          securityPolicy: "Basic256Sha256",
          namespaceUri: PLC_NAMESPACE_URI,
          nodeIdPrefix: OPCUA_NODE_ID_PREFIX,
          gvlName: OPCUA_GVL_NAME,
          samplingMilliseconds: 20,
          publishingMilliseconds: 20,
          watchdogMilliseconds: 5000,
        },
        channels: [
          opcuaChannel(TAG_EXTEND_COMMAND, OPCUA_VARIABLES.extend, "BOOL"),
          opcuaChannel(TAG_RETRACT_COMMAND, OPCUA_VARIABLES.retract, "BOOL"),
          opcuaChannel(TAG_EXTENDED_SENSOR, OPCUA_VARIABLES.extended, "BOOL"),
          opcuaChannel(TAG_POSITION, OPCUA_VARIABLES.position, "REAL"),
        ],
      },
    ],
  });
}

export async function copyPlcCylinderWithTwoModules(options: CopyOptions): Promise<void> {
  const folder = join(options.pantinsDirectory, PANTIN_ID);
  await cp(EXAMPLE_FOLDER, folder, { recursive: true });
  const document = buildDocument(options);
  await writeFile(join(folder, "io.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}
