import { describe, expect, it } from "vitest";
import { bridgeStatusOf, FAILED_STATUS, RUNNING_STATUS } from "./bridge-fixtures.ts";
import { moduleConnection, moduleConnectionTone } from "./module-connection.ts";

describe("the connection of a module", () => {
  it("is connected or waiting while the bridge runs", () => {
    expect(moduleConnection(RUNNING_STATUS, "m1")).toBe("connected");
    expect(moduleConnection(RUNNING_STATUS, "m2")).toBe("waiting");
  });

  it("is stopped in every other state, without a status, and for an unknown key", () => {
    expect(moduleConnection(null, "m1")).toBe("stopped");
    expect(moduleConnection(bridgeStatusOf(), "m1")).toBe("stopped");
    expect(moduleConnection(FAILED_STATUS, "m1")).toBe("stopped");
    expect(moduleConnection(RUNNING_STATUS, "other")).toBe("stopped");
  });

  it("has a tone per connection", () => {
    expect(
      (["stopped", "waiting", "connected"] as const).map((value) => moduleConnectionTone(value)),
    ).toEqual(["idle", "busy", "ok"]);
  });
});
