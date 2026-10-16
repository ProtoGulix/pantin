import { describe, expect, it } from "vitest";
import {
  decideRelease,
  decideWrite,
  pruneTagStates,
  type TagState,
  type TagStates,
  UNWRITTEN_TAG_STATE,
} from "./tag-states.ts";

const FORCED: TagState = { forced: true, lastSource: "client", plcValue: null };

describe("decideWrite", () => {
  it("applies a client write and forces the tag, keeping the PLC's last value", () => {
    const state: TagState = { forced: false, lastSource: "plc", plcValue: 1 };
    expect(decideWrite(state, "client", 0)).toEqual({
      state: { forced: true, lastSource: "client", plcValue: 1 },
      applied: true,
    });
  });

  it("applies a PLC write on a tag that is not forced, without forcing it", () => {
    expect(decideWrite(UNWRITTEN_TAG_STATE, "plc", 1)).toEqual({
      state: { forced: false, lastSource: "plc", plcValue: 1 },
      applied: true,
    });
  });

  it("ignores a PLC write on a forced tag but keeps its value for the release", () => {
    expect(decideWrite(FORCED, "plc", 0)).toEqual({
      state: { forced: true, lastSource: "client", plcValue: 0 },
      applied: false,
    });
  });
});

describe("decideRelease", () => {
  it("ends the force and asks for the PLC's last value, when there is one", () => {
    expect(decideRelease({ ...FORCED, plcValue: 0 })).toEqual({
      state: { forced: false, lastSource: "client", plcValue: 0 },
      reapplyValue: 0,
    });
    expect(decideRelease(FORCED).reapplyValue).toBeNull();
  });

  it("leaves a tag that is not forced as it is", () => {
    const state: TagState = { forced: false, lastSource: "plc", plcValue: 1 };
    expect(decideRelease(state)).toEqual({ state, reapplyValue: null });
  });
});

describe("pruneTagStates", () => {
  it("drops the states of tags that no longer exist", () => {
    const states: TagStates = new Map([
      ["joint:a/setpoint", FORCED],
      ["joint:b/setpoint", FORCED],
    ]);
    pruneTagStates(states, new Set(["joint:a/setpoint"]));
    expect([...states.keys()]).toEqual(["joint:a/setpoint"]);
  });
});
