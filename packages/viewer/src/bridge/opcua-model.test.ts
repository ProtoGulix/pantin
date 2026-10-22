import { describe, expect, it } from "vitest";
import { opcuaStatusOf } from "./bridge-fixtures.ts";
import {
  INITIAL_OPCUA_MODEL,
  isOpcuaActive,
  opcuaAfterAnswer,
  opcuaAfterStreamList,
  opcuaStartRequest,
  opcuaWithPending,
  opcuaWithTarget,
} from "./opcua-model.ts";

const list = (...bridges: ReturnType<typeof opcuaStatusOf>[]) => ({ bridges });

describe("the OPC UA card's model", () => {
  it("keeps the targets as typed, per module", () => {
    const typed = opcuaWithTarget(
      opcuaWithTarget(INITIAL_OPCUA_MODEL, "a", "10.0.0.2"),
      "b",
      "10.0.0.3",
    );
    expect(typed.targets).toEqual({ a: "10.0.0.2", b: "10.0.0.3" });
  });

  it("shows the targets of the last start when the state leaves stopped", () => {
    const stopped = opcuaAfterStreamList(INITIAL_OPCUA_MODEL, list(opcuaStatusOf()));
    const failed = opcuaAfterStreamList(
      stopped,
      list(opcuaStatusOf({ state: "failed", network: { targets: { a: "10.0.0.9" } } })),
    );
    expect(failed.targets).toEqual({ a: "10.0.0.9" });
  });

  it("leaves what is typed alone within one state", () => {
    const running = opcuaAfterStreamList(
      INITIAL_OPCUA_MODEL,
      list(opcuaStatusOf({ state: "running", network: { targets: { a: "10.0.0.9" } } })),
    );
    const typed = opcuaWithTarget(running, "a", "10.0.0.10");
    const again = opcuaAfterStreamList(
      typed,
      list(opcuaStatusOf({ state: "running", network: { targets: { a: "10.0.0.9" } } })),
    );
    expect(again.targets).toEqual({ a: "10.0.0.10" });
  });

  it("reads a core without an OPC UA bridge as a bridge that cannot start", () => {
    expect(opcuaAfterStreamList(INITIAL_OPCUA_MODEL, { bridges: [] }).status?.availability).toBe(
      "unavailable",
    );
  });

  it("drops an answer that a streamed status already outdated", () => {
    const pending = opcuaWithPending(INITIAL_OPCUA_MODEL, true);
    const streamed = opcuaAfterStreamList(pending, list(opcuaStatusOf({ state: "stopped" })));
    expect(opcuaAfterAnswer(streamed, opcuaStatusOf({ state: "stopping" }))).toBe(streamed);
  });

  it("is active while starting or running", () => {
    const of = (state: "stopped" | "starting" | "running" | "failed") =>
      isOpcuaActive(opcuaAfterStreamList(INITIAL_OPCUA_MODEL, list(opcuaStatusOf({ state }))));
    expect([of("stopped"), of("starting"), of("running"), of("failed")]).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});

describe("the OPC UA start request", () => {
  const model = opcuaWithTarget(
    opcuaWithTarget(INITIAL_OPCUA_MODEL, "a", " 10.0.0.2 "),
    "b",
    "10.0.0.3",
  );

  it("names exactly the modules, with trimmed targets, and nothing optional by default", () => {
    expect(opcuaStartRequest(model, { moduleKeys: ["a", "b"], passwords: {}, trust: [] })).toEqual({
      running: true,
      targets: { a: "10.0.0.2", b: "10.0.0.3" },
    });
  });

  it("sends typed passwords only, so that an omitted one keeps the stored password", () => {
    const request = opcuaStartRequest(model, {
      moduleKeys: ["a", "b"],
      passwords: { a: "secret", b: "" },
      trust: [],
    });
    expect(request).toEqual({
      running: true,
      targets: { a: "10.0.0.2", b: "10.0.0.3" },
      passwords: { a: "secret" },
    });
  });

  it("pins the certificate to trust", () => {
    const sha256 = "a".repeat(64);
    expect(opcuaStartRequest(model, { moduleKeys: ["a"], passwords: {}, trust: [sha256] })).toEqual(
      { running: true, targets: { a: "10.0.0.2" }, trust: [sha256] },
    );
  });
});
