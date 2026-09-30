import { describe, expect, it } from "vitest";
import { createRenderSwitch } from "./render-switch.ts";

function fakeEngine() {
  const running: (() => void)[] = [];
  const calls: string[] = [];
  return {
    running,
    calls,
    engine: {
      runRenderLoop: (loop: () => void) => {
        calls.push("run");
        running.push(loop);
      },
      stopRenderLoop: (loop?: () => void) => {
        calls.push("stop");
        running.splice(0, running.length, ...running.filter((candidate) => candidate !== loop));
      },
    },
  };
}

describe("createRenderSwitch", () => {
  it("starts rendering at once and draws the scene on each frame", () => {
    const { engine, running } = fakeEngine();
    let frames = 0;
    createRenderSwitch(engine, { render: () => (frames += 1) });
    running[0]?.();
    expect(frames).toBe(1);
  });

  it("does nothing when asked for the state it is in", () => {
    const { engine, calls } = fakeEngine();
    const setRendering = createRenderSwitch(engine, { render: () => undefined });
    setRendering(true);
    setRendering(false);
    setRendering(false);
    expect(calls).toEqual(["run", "stop"]);
  });

  it("stops and restarts the very same frame function", () => {
    const { engine, running } = fakeEngine();
    const setRendering = createRenderSwitch(engine, { render: () => undefined });
    const frame = running[0];
    setRendering(false);
    expect(running).toHaveLength(0);
    setRendering(true);
    expect(running).toEqual([frame]);
  });
});
