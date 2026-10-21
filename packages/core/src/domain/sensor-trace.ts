import type { ConsoleEvent, PantinDocument } from "@pantin/protocol";
import { TRACE_BUDGET_ENTRIES, TRACE_BUDGET_WINDOW_STEPS } from "@pantin/protocol";
import { tagEntries } from "./tag-entries.ts";

// The verbose trace of ADR 0061: a sensor changing state, as console lines.
// Pure: the caller decides whether verbose is on and records the events.

type TagValuesByOwner = ReadonlyMap<string, Readonly<Record<string, number>>>;

// The feedback values of the sensors at one moment, by sensor id.
export type SensorTraceSnapshot = {
  jointSensors: TagValuesByOwner;
  presenceSensors: TagValuesByOwner;
};

function bitValue(value: number | undefined): 0 | 1 | undefined {
  return value === undefined ? undefined : value === 0 ? 0 : 1;
}

/**
 * One `sensor_changed` event for each bit feedback tag of a joint sensor or a
 * presence sensor that differs between two snapshots, in tag order. Other
 * types, such as the encoder's counter, are never traced: they would change at
 * every step. A joint sensor with no earlier value (never stepped, or just
 * reset) has nothing to compare and is skipped; a presence sensor that was
 * not stepped reads 0, as its tag does.
 */
export function sensorChangeEvents(
  document: PantinDocument,
  before: SensorTraceSnapshot,
  after: SensorTraceSnapshot,
): ConsoleEvent[] {
  const events: ConsoleEvent[] = [];
  for (const entry of tagEntries(document)) {
    if (entry.type !== "bit" || entry.direction !== "feedback") {
      continue;
    }
    const { owner } = entry;
    if (owner.kind === "sensor") {
      const previous = bitValue(before.jointSensors.get(owner.sensor.id)?.[entry.member]);
      const current = bitValue(after.jointSensors.get(owner.sensor.id)?.[entry.member]);
      if (previous !== undefined && current !== undefined && previous !== current) {
        events.push(sensorChanged({ kind: "sensor", id: owner.sensor.id }, entry.name, current));
      }
    } else if (owner.kind === "presenceSensor") {
      const id = owner.presenceSensor.id;
      const previous = bitValue(before.presenceSensors.get(id)?.[entry.member] ?? 0);
      const current = bitValue(after.presenceSensors.get(id)?.[entry.member] ?? 0);
      if (previous !== current && current !== undefined) {
        events.push(sensorChanged({ kind: "presence_sensor", id }, entry.name, current));
      }
    }
  }
  return events;
}

function sensorChanged(
  source: Extract<ConsoleEvent, { code: "sensor_changed" }>["source"],
  tag: string,
  value: 0 | 1,
): ConsoleEvent {
  return { code: "sensor_changed", level: "trace", source, params: { tag, value } };
}

// The budget of a window of steps (ADR 0061 point 5), counted in steps, never
// in wall time, so that a test reproduces it.
export type TraceBudget = {
  // Index of the window: floor((step - 1) / TRACE_BUDGET_WINDOW_STEPS).
  window: number;
  used: number;
  dropped: number;
};

export const EMPTY_TRACE_BUDGET: TraceBudget = { window: 0, used: 0, dropped: 0 };

function traceDroppedEvent(dropped: number): ConsoleEvent {
  return {
    code: "trace_dropped",
    level: "info",
    source: { kind: "pantin" },
    params: { dropped },
  };
}

/**
 * Keeps the trace events that fit the budget of the window `step` (the number
 * of the step just run, from 1) belongs to, and adds one `trace_dropped` event
 * when a window closes with some left out: at its last step, or when a later
 * window starts after the budget was left idle (verbose switched off in between).
 */
export function applyTraceBudget(
  budget: TraceBudget,
  step: number,
  traceEvents: readonly ConsoleEvent[],
): { budget: TraceBudget; events: ConsoleEvent[] } {
  const window = Math.floor((step - 1) / TRACE_BUDGET_WINDOW_STEPS);
  const events: ConsoleEvent[] = [];
  let current = budget;
  if (window !== budget.window) {
    if (budget.dropped > 0) {
      events.push(traceDroppedEvent(budget.dropped));
    }
    current = { window, used: 0, dropped: 0 };
  }
  const room = Math.max(0, TRACE_BUDGET_ENTRIES - current.used);
  const admitted = traceEvents.slice(0, room);
  events.push(...admitted);
  current = {
    window,
    used: current.used + admitted.length,
    dropped: current.dropped + traceEvents.length - admitted.length,
  };
  if (step % TRACE_BUDGET_WINDOW_STEPS === 0) {
    if (current.dropped > 0) {
      events.push(traceDroppedEvent(current.dropped));
    }
    current = { window: window + 1, used: 0, dropped: 0 };
  }
  return { budget: current, events };
}
