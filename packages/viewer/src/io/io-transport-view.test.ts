import type { IoMappedChannel, IoMappingModule } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  channelCells,
  channelColumns,
  channelPlace,
  creatableKinds,
  moduleSettings,
  moduleSubtitle,
} from "./io-transport-view.ts";

// The OPC UA module in the I/O view (ADR 0065 point 13).

const module: IoMappingModule = {
  key: "plc",
  transport: {
    kind: "opcua_client",
    port: 4840,
    endpointPath: "",
    securityMode: "SignAndEncrypt",
    securityPolicy: "Basic256Sha256",
    auth: { kind: "anonymous" },
    namespaceUri: "urn:plc",
    nodeIdPrefix: "|var|CODESYS Control Win V3 x64.Application.",
    gvlName: "GVL_Pantin",
    samplingMilliseconds: 20,
    publishingMilliseconds: 20,
    watchdogMilliseconds: 1000,
  },
  channels: [],
};

const channel: IoMappedChannel = {
  tag: "press.valve.extend",
  variable: "extend",
  comment: "",
  opcua: { identifier: null, iecType: "BOOL", resolvedIdentifier: "s=GVL_Pantin.extend" },
  tagType: "bit",
  direction: "command",
  owner: null,
};

describe("an OPC UA module in the I/O view", () => {
  it("has a heading with its name, port, security and login", () => {
    expect(moduleSubtitle(module, "en")).toBe(
      "OPC UA client · port 4840 · Sign and encrypt · Basic256Sha256 · anonymous",
    );
    expect(moduleSubtitle(module, "fr")).toBe(
      "Client OPC UA · port 4840 · Signer et chiffrer · Basic256Sha256 · anonyme",
    );
  });

  it("names the user in the heading and says when there is no security", () => {
    const user = {
      ...module,
      transport: {
        ...module.transport,
        securityMode: "None",
        securityPolicy: "None",
        auth: { kind: "user", userName: "operator" },
      },
    } as IoMappingModule;
    expect(moduleSubtitle(user, "en")).toBe(
      "OPC UA client · port 4840 · no security · user and password (operator)",
    );
  });

  it("shows the resolved node, whether it is derived or explicit, and the IEC type", () => {
    expect(channelColumns("opcua_client", "fr").map((column) => column.label)).toEqual([
      "Noeud",
      "Identifiant",
      "Type",
    ]);
    expect(channelCells("opcua_client", channel, "fr")).toEqual([
      { field: "resolvedIdentifier", text: "s=GVL_Pantin.extend", editable: false, long: true },
      { field: "identifier", text: "dérivé", editable: false, long: false },
      { field: "iecType", text: "BOOL", editable: false, long: false },
    ]);
    const explicit = {
      ...channel,
      opcua: {
        identifier: "s=Other.extend",
        iecType: "BOOL",
        resolvedIdentifier: "s=Other.extend",
      },
    } as IoMappedChannel;
    expect(channelCells("opcua_client", explicit, "en")[1]?.text).toBe("explicit");
    expect(channelPlace("opcua_client", channel, "en")).toBe("s=GVL_Pantin.extend");
  });

  it("offers every setting in its form, the user name reading from the login", () => {
    const names = moduleSettings(module, "en").map((setting) => setting.name);
    expect(names).toEqual([
      "port",
      "endpointPath",
      "securityMode",
      "securityPolicy",
      "userName",
      "namespaceUri",
      "nodeIdPrefix",
      "gvlName",
      "samplingMilliseconds",
      "publishingMilliseconds",
      "watchdogMilliseconds",
    ]);
    const user = {
      ...module,
      transport: { ...module.transport, auth: { kind: "user", userName: "bob" } },
    } as IoMappingModule;
    expect(moduleSettings(user, "en").find((setting) => setting.name === "userName")?.value).toBe(
      "bob",
    );
  });

  it("gives the namespace URI and the NodeId prefix a wide field, to be read whole", () => {
    const wide = moduleSettings(module, "en").filter((setting) => setting.wide);
    expect(wide.map((setting) => setting.name)).toEqual(["namespaceUri", "nodeIdPrefix"]);
  });

  it("is offered when creating a module", () => {
    expect(creatableKinds("en").map((choice) => choice.kind)).toEqual([
      "modbus_tcp_slave",
      "opcua_client",
    ]);
  });
});
