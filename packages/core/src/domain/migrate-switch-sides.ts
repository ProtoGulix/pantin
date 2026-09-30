import {
  MATERIAL_FACTORS,
  SensorFieldsSchema,
  sensorPlacementProblem,
} from "@pantin/sensor-types/schemas";
import { switchZonesOf } from "@pantin/sensor-types/zones";
import { isJsonObject, type JsonObject } from "./json-object.ts";

// Version 8 deduces a switch's side from its joint's stroke (ADR 0026 point
// 5): the direction fields go. An inductive face inside the stroke moves to
// the nearer end (its old direction was the mistake the ADR fixes), and a
// limit switch's overtravel grows to reach its end. A limit switch whose side
// would change, or a switch the new rules still refuse (on a continuous
// joint, at mid-stroke, outside the stroke), becomes an ideal switch over its
// old on zone, so that the document still opens and behaves as before, but
// for the hysteresis.

type Interval = readonly [number, number];
type Stroke = Interval | null;

// The fields every sensor has, which an ideal switch keeps.
const COMMON_FIELDS = ["id", "tagKey", "name", "assembly", "joint", "normallyClosed"];

export function migrateV7ToV8(document: JsonObject): JsonObject {
  const joints = Array.isArray(document.joints) ? document.joints.filter(isJsonObject) : [];
  const strokeOf = (jointId: unknown): Stroke => {
    const limits = joints.find((joint) => joint.id === jointId)?.limits;
    const [lower, upper]: unknown[] = Array.isArray(limits) ? limits : [];
    return typeof lower === "number" && typeof upper === "number" ? [lower, upper] : null;
  };
  const sensors = Array.isArray(document.sensors)
    ? document.sensors.map((sensor: unknown) =>
        isJsonObject(sensor) ? migratedSensor(sensor, strokeOf(sensor.joint)) : sensor,
      )
    : document.sensors;
  return { ...document, schema_version: 8, sensors };
}

function migratedSensor(sensor: JsonObject, stroke: Stroke): JsonObject {
  const { approach: _approach, actuation: _actuation, ...rest } = sensor;
  const placed = stroke === null ? rest : placedOnStroke(rest, stroke);
  const parsed = SensorFieldsSchema.safeParse(placed);
  const old = oldZones(sensor);
  if (!parsed.success || old === null) {
    // Left to the document schema, which says what is wrong.
    return placed;
  }
  const newOn = switchZonesOf(parsed.data, stroke)?.on;
  const sideKept = sensor.type !== "limit_switch" || sameInterval(newOn, old.on);
  if (sideKept && sensorPlacementProblem(parsed.data, stroke) === null) {
    return placed;
  }
  const range = (stroke === null ? null : overlap(old.on, stroke)) ?? old.shown;
  const common = COMMON_FIELDS.filter((field) => field in sensor).map((field) => [
    field,
    sensor[field],
  ]);
  return { ...Object.fromEntries(common), type: "position_switch", range };
}

function placedOnStroke(sensor: JsonObject, [lower, upper]: Interval): JsonObject {
  const nearerEnd = (position: number) => (upper - position < position - lower ? upper : lower);
  const { type, facePosition: face, operatingPosition: operating, overtravel } = sensor;
  if (type === "inductive_switch" && typeof face === "number" && face > lower && face < upper) {
    return { ...sensor, facePosition: nearerEnd(face) };
  }
  if (type === "limit_switch" && typeof operating === "number" && typeof overtravel === "number") {
    const toEnd = Math.abs(nearerEnd(operating) - operating);
    return { ...sensor, overtravel: Math.max(overtravel, toEnd) };
  }
  return sensor;
}

/** A version 7 switch's on zone and drawn zone, from its direction field; null for other sensors. */
function oldZones(sensor: JsonObject): { on: Interval; shown: Interval } | null {
  const sign = sensor.actuation === "decreasing" || sensor.approach === "decreasing" ? -1 : 1;
  const onFrom = (start: number): Interval =>
    sign > 0 ? [start, Number.POSITIVE_INFINITY] : [Number.NEGATIVE_INFINITY, start];
  const between = (first: number, second: number): Interval => [
    Math.min(first, second),
    Math.max(first, second),
  ];
  const { operatingPosition: operating, overtravel } = sensor;
  if (
    sensor.type === "limit_switch" &&
    typeof operating === "number" &&
    typeof overtravel === "number"
  ) {
    return { on: onFrom(operating), shown: between(operating, operating + sign * overtravel) };
  }
  const { facePosition: face, nominalDistance } = sensor;
  const factor = new Map(Object.entries(MATERIAL_FACTORS)).get(String(sensor.material));
  if (
    sensor.type === "inductive_switch" &&
    typeof face === "number" &&
    typeof nominalDistance === "number" &&
    factor !== undefined
  ) {
    const switchOn = face - sign * nominalDistance * factor;
    return { on: onFrom(switchOn), shown: between(switchOn, face) };
  }
  return null;
}

function overlap([lower, upper]: Interval, [strokeLower, strokeUpper]: Interval): Interval | null {
  const from = Math.max(lower, strokeLower);
  const to = Math.min(upper, strokeUpper);
  return from <= to ? [from, to] : null;
}

function sameInterval(first: Interval | undefined, second: Interval): boolean {
  return first !== undefined && first[0] === second[0] && first[1] === second[1];
}
