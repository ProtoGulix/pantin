import type { IoMappedChannel, IoMappingModule } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  channelCells,
  channelColumns,
  channelPlace,
  creatableKinds,
  moduleSubtitle,
} from "./io-transport-view.ts";

// An io.json with an OPC UA module is shown, though the viewer cannot create one yet
// (ADR 0065: the full OPC UA viewer is slice S5).

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
  it("has a heading with its name, port and security", () => {
    expect(moduleSubtitle(module, "en")).toBe(
      "OPC UA client · Port 4840 · Security mode Sign and encrypt · Security policy Basic256Sha256",
    );
  });

  it("shows the resolved node and the IEC type, none of them editable here", () => {
    expect(channelColumns("opcua_client", "fr").map((column) => column.label)).toEqual([
      "Noeud",
      "Type",
    ]);
    expect(channelCells("opcua_client", channel, "en")).toEqual([
      { field: "resolvedIdentifier", text: "s=GVL_Pantin.extend", editable: false },
      { field: "iecType", text: "BOOL", editable: false },
    ]);
    expect(channelPlace("opcua_client", channel, "en")).toBe("s=GVL_Pantin.extend");
  });

  it("is not offered when creating a module", () => {
    expect(creatableKinds("en").map((choice) => choice.kind)).not.toContain("opcua_client");
  });
});
