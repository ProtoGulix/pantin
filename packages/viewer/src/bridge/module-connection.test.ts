import { describe, expect, it } from "vitest";
import { bridgeStatusOf, FAILED_STATUS, opcuaStatusOf, RUNNING_STATUS } from "./bridge-fixtures.ts";
import { moduleConnection, moduleConnectionTone } from "./module-connection.ts";

describe("the connection of a module", () => {
  it("is connected or waiting while the bridge runs", () => {
    expect(moduleConnection([RUNNING_STATUS], "m1")).toBe("connected");
    expect(moduleConnection([RUNNING_STATUS], "m2")).toBe("waiting");
  });

  it("is stopped in every other state, without a status, and for an unknown key", () => {
    expect(moduleConnection([], "m1")).toBe("stopped");
    expect(moduleConnection([bridgeStatusOf()], "m1")).toBe("stopped");
    expect(moduleConnection([FAILED_STATUS], "m1")).toBe("stopped");
    expect(moduleConnection([RUNNING_STATUS], "other")).toBe("stopped");
  });

  it("reads the module in whichever bridge holds it", () => {
    const opcua = opcuaStatusOf({
      state: "running",
      modules: [
        { key: "ua", endpoint: "opc.tcp://10.0.0.2:4840", plcConnected: true, reason: null },
      ],
    });
    expect(moduleConnection([RUNNING_STATUS, opcua], "ua")).toBe("connected");
    expect(moduleConnection([RUNNING_STATUS, opcua], "m2")).toBe("waiting");
  });

  it("has a tone per connection", () => {
    expect(
      (["stopped", "waiting", "connected"] as const).map((value) => moduleConnectionTone(value)),
    ).toEqual(["idle", "busy", "ok"]);
  });
});
