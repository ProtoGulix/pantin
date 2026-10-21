import type { Placement } from "@pantin/protocol";
import { TRACE_BUDGET_ENTRIES, TRACE_BUDGET_WINDOW_STEPS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { readConsoleAfter } from "../domain/console-buffer.ts";
import { conveyorLine, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { documentOf } from "../test-support/placed-fixtures.ts";
import { bitSwitch, encoderSensor, slideJoint } from "../test-support/sensor-trace-fixtures.ts";
import { setConsoleVerbose } from "./console-operations.ts";
import { listTags } from "./tag-operations.ts";

// The verbose trace of ADR 0061 through real steps: a slide with a switch on
// its upper half and an encoder, moved by writing its setpoint.

const open = benchesClosedAfterEach();

const SETPOINT = "main.slide.setpoint";

function slideBench(verbose: boolean): Bench {
  const bench = open(
    documentOf([slideJoint()], undefined, undefined, { sensors: [bitSwitch(), encoderSensor()] }),
  );
  bench.openPantin.verbose = verbose;
  return bench;
}

function traceEntries(bench: Bench) {
  return bench.openPantin.console.entries.filter((entry) => entry.level === "trace");
}

describe("the sensor trace in the step", () => {
  it("writes a trace entry when a switch changes, and none for the encoder count", async () => {
    const bench = slideBench(true);
    bench.step(2);
    expect(traceEntries(bench)).toEqual([]);
    await bench.write(SETPOINT, 0.08);
    bench.step(1);
    const entries = traceEntries(bench);
    expect(entries.map((entry) => entry.params)).toEqual([{ tag: "main.end.state", value: 1 }]);
    expect(entries[0]?.source).toEqual({ kind: "sensor", id: "end" });
  });

  it("writes no trace entry while verbose is off", async () => {
    const bench = slideBench(false);
    bench.step(1);
    await bench.write(SETPOINT, 0.08);
    bench.step(3);
    expect(traceEntries(bench)).toEqual([]);
  });

  it("does not count trace entries as errors or warnings", async () => {
    const bench = slideBench(true);
    bench.step(1);
    await bench.write(SETPOINT, 0.08);
    bench.step(1);
    const answer = readConsoleAfter(bench.openPantin.console, 0, true);
    const counted = answer.entries.filter(
      (entry) => entry.level === "error" || entry.level === "warning",
    );
    expect(answer.entries.some((entry) => entry.level === "trace")).toBe(true);
    expect(counted).toEqual([]);
  });
});

describe("verbose mode and the simulation", () => {
  it("keeps the simulation identical whether verbose is on or off", async () => {
    async function run(verbose: boolean) {
      const bench = slideBench(verbose);
      bench.step(1);
      for (let round = 0; round < 6; round += 1) {
        await bench.write(SETPOINT, round % 2 === 0 ? 0.09 : 0.01);
        bench.step(20);
      }
      return {
        tags: (await listTags(bench.context, "line")).tags,
        positions: [...bench.openPantin.jointPositions],
        outputs: [...bench.openPantin.sensorOutputs],
        stepCount: bench.openPantin.stepCount,
      };
    }
    expect(await run(true)).toEqual(await run(false));
  });
});

describe("the trace budget", () => {
  it("keeps at most the budget per window and reports the rest once, as step 120 ends", async () => {
    const bench = open(
      documentOf([slideJoint()], undefined, undefined, {
        sensors: ["a", "b", "c"].map((id) => bitSwitch(id)),
      }),
    );
    bench.openPantin.verbose = true;
    // Step 1 has no earlier sensor value, then each of steps 2 to 120 flips all three.
    bench.step(1);
    for (let step = 2; step <= TRACE_BUDGET_WINDOW_STEPS; step += 1) {
      await bench.write(SETPOINT, step % 2 === 0 ? 0.09 : 0.01);
      bench.step(1);
    }
    expect(traceEntries(bench)).toHaveLength(TRACE_BUDGET_ENTRIES);
    const dropped = bench.openPantin.console.entries.filter(
      (entry) => entry.code === "trace_dropped",
    );
    const flips = 3 * (TRACE_BUDGET_WINDOW_STEPS - 1);
    expect(dropped.map((entry) => entry.params)).toEqual([
      { dropped: flips - TRACE_BUDGET_ENTRIES },
    ]);
    expect(dropped[0]?.level).toBe("info");
    // The next window starts with a full budget again.
    await bench.write(SETPOINT, 0.01);
    bench.step(1);
    expect(traceEntries(bench)).toHaveLength(TRACE_BUDGET_ENTRIES + 3);
  });
});

describe("the verbose switch", () => {
  it("is switched by setConsoleVerbose, which is idempotent", async () => {
    const bench = slideBench(false);
    expect(await setConsoleVerbose(bench.context, "line", true)).toEqual({ verbose: true });
    expect(await setConsoleVerbose(bench.context, "line", true)).toEqual({ verbose: true });
    expect(bench.openPantin.verbose).toBe(true);
    expect(await setConsoleVerbose(bench.context, "line", false)).toEqual({ verbose: false });
  });
});

// Box centre at x = -0.35; a beam along +X from x = -0.6 hits it at once.
const ALONG_BELT: Placement = {
  translation: [-0.6, 0, 0.05],
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
};

function cellBench(verbose: boolean): Bench {
  const bench = open(
    conveyorLine({ presenceSensors: [photoelectricCell({ placement: ALONG_BELT, range: 0.5 })] }),
  );
  bench.openPantin.verbose = verbose;
  return bench;
}

async function runCarton(verbose: boolean) {
  const bench = cellBench(verbose);
  await bench.write("main.contactor.run", 1);
  await bench.write("main.source.spawn", 1);
  bench.step(150);
  return {
    tags: (await listTags(bench.context, "line")).tags,
    products: bench.products(),
    outputs: [...bench.openPantin.physicsState.presenceOutputs],
  };
}

describe("the presence sensor trace", () => {
  it("traces a carton entering the beam with the presence_sensor source", async () => {
    const bench = cellBench(true);
    bench.step(2);
    await bench.write("main.source.spawn", 1);
    bench.step(1);
    const [entry] = traceEntries(bench);
    expect(entry?.source).toEqual({ kind: "presence_sensor", id: "cell" });
    expect(entry?.params).toEqual({ tag: "main.cell.state", value: 1 });
  });

  it("keeps the simulation identical whether verbose is on or off", async () => {
    expect(await runCarton(true)).toEqual(await runCarton(false));
  });
});
