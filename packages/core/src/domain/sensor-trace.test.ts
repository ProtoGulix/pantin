import type { ConsoleEvent, PantinDocument } from "@pantin/protocol";
import { TRACE_BUDGET_ENTRIES, TRACE_BUDGET_WINDOW_STEPS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { documentOf } from "../test-support/placed-fixtures.ts";
import { bitSwitch, encoderSensor, slideJoint } from "../test-support/sensor-trace-fixtures.ts";
import {
  applyTraceBudget,
  EMPTY_TRACE_BUDGET,
  type SensorTraceSnapshot,
  sensorChangeEvents,
} from "./sensor-trace.ts";

const DOCUMENT: PantinDocument = documentOf([slideJoint()], undefined, undefined, {
  sensors: [bitSwitch(), encoderSensor()],
  presenceSensors: [photoelectricCell()],
});

function snapshot(
  joint: { state?: number; count?: number },
  presence?: { state: number },
): SensorTraceSnapshot {
  return {
    jointSensors: new Map([
      ["end", { state: joint.state ?? 0 }],
      ["counter", { count: joint.count ?? 0 }],
    ]),
    presenceSensors: new Map(presence === undefined ? [] : [["cell", presence]]),
  };
}

describe("sensorChangeEvents", () => {
  it("reports no event when nothing changed", () => {
    expect(sensorChangeEvents(DOCUMENT, snapshot({}), snapshot({}))).toEqual([]);
  });

  it("reports a joint sensor bit with its full tag name and new value", () => {
    expect(sensorChangeEvents(DOCUMENT, snapshot({ state: 0 }), snapshot({ state: 1 }))).toEqual([
      {
        code: "sensor_changed",
        level: "trace",
        source: { kind: "sensor", id: "end" },
        params: { tag: "main.end.state", value: 1 },
      },
    ]);
  });

  it("never traces an integer tag, such as an encoder count", () => {
    expect(sensorChangeEvents(DOCUMENT, snapshot({ count: 3 }), snapshot({ count: 9 }))).toEqual(
      [],
    );
  });

  it("reports a presence sensor with the presence_sensor source", () => {
    const events = sensorChangeEvents(
      DOCUMENT,
      snapshot({}, { state: 0 }),
      snapshot({}, { state: 1 }),
    );
    expect(events).toEqual([
      {
        code: "sensor_changed",
        level: "trace",
        source: { kind: "presence_sensor", id: "cell" },
        params: { tag: "main.cell.state", value: 1 },
      },
    ]);
  });

  it("reports the fall of a bit as value 0", () => {
    const events = sensorChangeEvents(DOCUMENT, snapshot({ state: 1 }), snapshot({ state: 0 }));
    expect(events[0]?.params).toEqual({ tag: "main.end.state", value: 0 });
  });

  it("skips a joint sensor with no earlier value", () => {
    const empty: SensorTraceSnapshot = { jointSensors: new Map(), presenceSensors: new Map() };
    expect(sensorChangeEvents(DOCUMENT, empty, snapshot({ state: 1 }))).toEqual([]);
  });
});

function changes(count: number): ConsoleEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    code: "sensor_changed",
    level: "trace",
    source: { kind: "sensor", id: "end" },
    params: { tag: "main.end.state", value: index % 2 === 0 ? 1 : 0 },
  }));
}

describe("applyTraceBudget", () => {
  it("lets through the entries that fit the budget", () => {
    const result = applyTraceBudget(EMPTY_TRACE_BUDGET, 1, changes(5));
    expect(result.events).toHaveLength(5);
    expect(result.budget).toEqual({ window: 0, used: 5, dropped: 0 });
  });

  it("drops the surplus and reports its count at the last step of the window", () => {
    const first = applyTraceBudget(EMPTY_TRACE_BUDGET, 1, changes(TRACE_BUDGET_ENTRIES + 7));
    expect(first.events).toHaveLength(TRACE_BUDGET_ENTRIES);
    expect(first.budget.dropped).toBe(7);
    const last = applyTraceBudget(first.budget, TRACE_BUDGET_WINDOW_STEPS, changes(3));
    expect(last.events.map((event) => event.code)).toEqual(["trace_dropped"]);
    expect(last.events[0]?.params).toEqual({ dropped: 10 });
    expect(last.budget).toEqual({ window: 1, used: 0, dropped: 0 });
  });

  it("starts a full budget in the next window", () => {
    const full = { window: 0, used: TRACE_BUDGET_ENTRIES, dropped: 0 };
    const next = applyTraceBudget(full, TRACE_BUDGET_WINDOW_STEPS + 1, changes(4));
    expect(next.events).toHaveLength(4);
  });

  it("reports a pending count when a later window starts", () => {
    const stale = { window: 0, used: TRACE_BUDGET_ENTRIES, dropped: 2 };
    const next = applyTraceBudget(stale, TRACE_BUDGET_WINDOW_STEPS * 3 + 1, []);
    expect(next.events.map((event) => event.params)).toEqual([{ dropped: 2 }]);
  });
});
