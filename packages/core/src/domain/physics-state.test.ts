import { describe, expect, it } from "vitest";
import { emptyPhysicsState, writeSpawnValue } from "./physics-state.ts";

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
