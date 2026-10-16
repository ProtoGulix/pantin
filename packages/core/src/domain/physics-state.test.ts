import { describe, expect, it } from "vitest";
import {
  emptyPhysicsState,
  forgetEmitter,
  forgetPresenceSensor,
  writeSpawnValue,
} from "./physics-state.ts";

describe("writeSpawnValue", () => {
  it("latches one spawn for a 1 over a 0 or over nothing", () => {
    const written = writeSpawnValue(emptyPhysicsState(), "source", 1);
    expect(written.queuedSpawns).toEqual(["source"]);
    expect(written.spawnValues.get("source")).toBe(1);
  });

  it("latches nothing for a 0, and remembers it", () => {
    const state = writeSpawnValue(writeSpawnValue(emptyPhysicsState(), "source", 1), "source", 0);
    expect(state.queuedSpawns).toEqual(["source"]);
    expect(state.spawnValues.get("source")).toBe(0);
  });

  it("returns the same state for the value already held", () => {
    const state = writeSpawnValue(emptyPhysicsState(), "source", 1);
    expect(writeSpawnValue(state, "source", 1)).toBe(state);
    expect(writeSpawnValue(emptyPhysicsState(), "source", 0).queuedSpawns).toEqual([]);
  });

  it("does not change the state it was given", () => {
    const state = emptyPhysicsState();
    writeSpawnValue(state, "source", 1);
    expect(state.queuedSpawns).toEqual([]);
    expect(state.spawnValues.size).toBe(0);
  });
});

describe("forgetEmitter", () => {
  it("drops the last spawn value and the queued spawns of that emitter only", () => {
    const written = writeSpawnValue(writeSpawnValue(emptyPhysicsState(), "a", 1), "b", 1);
    const forgotten = forgetEmitter(written, "a");
    expect(forgotten.spawnValues.has("a")).toBe(false);
    expect(forgotten.queuedSpawns).toEqual(["b"]);
    // A new emitter under the same id spawns on its first write of 1.
    expect(writeSpawnValue(forgotten, "a", 1).queuedSpawns).toEqual(["b", "a"]);
  });
});

describe("forgetPresenceSensor", () => {
  it("drops the outputs and the evaluation state of that sensor only", () => {
    const state = {
      ...emptyPhysicsState(),
      presenceOutputs: new Map([
        ["a", { state: 1 }],
        ["b", { state: 1 }],
      ]),
      presenceStates: new Map([
        ["a", { raw: 1 }],
        ["b", { raw: 1 }],
      ]),
    };
    const forgotten = forgetPresenceSensor(state, "a");
    expect([...forgotten.presenceOutputs.keys()]).toEqual(["b"]);
    expect([...forgotten.presenceStates.keys()]).toEqual(["b"]);
    expect(state.presenceOutputs.size).toBe(2);
  });
});
