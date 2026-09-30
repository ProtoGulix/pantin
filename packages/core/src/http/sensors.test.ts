import {
  PantinResponseSchema,
  RenamedTagsResponseSchema,
  SensorResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CylinderAxis, startCylinderAxis } from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Phase 5 exit criterion (CLAUDE.md 13.5, ADR 0023): end-of-stroke switches
// flip at the right positions, read over REST, without a viewer. The rod is
// the carriage, on a 100 mm stroke, moved by a double-acting valve at 0.2 m/s.

const switchAt = (name: string, range: [number, number]) => ({
  name,
  assembly: "carriage",
  joint: "stroke",
  type: "position_switch",
  range,
  normallyClosed: false,
});

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
  await sendJsonRequest(
    axis.server,
    "POST",
    "/api/pantins/axis/sensors",
    switchAt("Extended", [0.098, 0.1]),
  );
  await sendJsonRequest(
    axis.server,
    "POST",
    "/api/pantins/axis/sensors",
    switchAt("Retracted", [0, 0.002]),
  );
});

afterEach(async () => {
  await axis.close();
});

async function tagValues(): Promise<Record<string, number>> {
  const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
  const { tags } = TagListResponseSchema.parse(response.json);
  return Object.fromEntries(tags.map((tag) => [tag.name, tag.value]));
}

describe("end-of-stroke switches over REST (phase 5 exit)", () => {
  it("flip at the ends of the stroke as the cylinder extends, then retracts", async () => {
    expect(await tagValues()).toMatchObject({
      "carriage.retracted.state": 1,
      "carriage.extended.state": 0,
    });
    await axis.writeTag("carriage.valve.extend", 1);
    const seen: { position: number; extended: number; retracted: number }[] = [];
    for (let step = 0; step < 66; step += 1) {
      axis.runSeconds(1 / 120);
      const values = await tagValues();
      seen.push({
        position: values["carriage.stroke.position"] ?? Number.NaN,
        extended: values["carriage.extended.state"] ?? Number.NaN,
        retracted: values["carriage.retracted.state"] ?? Number.NaN,
      });
    }
    // Every reading agrees with the position of the same reading.
    for (const { position, extended, retracted } of seen) {
      expect([extended, retracted]).toEqual([position >= 0.098 ? 1 : 0, position <= 0.002 ? 1 : 0]);
    }
    expect(seen.at(-1)).toEqual({ position: 0.1, extended: 1, retracted: 0 });
    await axis.writeTag("carriage.valve.extend", 0);
    await axis.writeTag("carriage.valve.retract", 1);
    axis.runSeconds(0.6);
    expect(await tagValues()).toMatchObject({
      "carriage.stroke.position": 0,
      "carriage.retracted.state": 1,
      "carriage.extended.state": 0,
    });
  });

  it("lists the switch states as feedback bits, which a client cannot write", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    const tags = TagListResponseSchema.parse(response.json).tags;
    expect(tags.filter((tag) => tag.name.endsWith(".state"))).toEqual([
      { name: "carriage.extended.state", type: "bit", direction: "feedback", value: 0 },
      { name: "carriage.retracted.state", type: "bit", direction: "feedback", value: 1 },
    ]);
    const refused = await axis.writeTag("carriage.extended.state", 1);
    expect(refused.status).toBe(400);
  });
});

describe("encoder over REST", () => {
  it("counts in whole pulses as an integer feedback tag", async () => {
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/sensors", {
      name: "Encoder",
      assembly: "carriage",
      joint: "stroke",
      type: "encoder",
      pulsesPerUnit: 10000,
    });
    await axis.writeTag("carriage.valve.extend", 1);
    axis.runSeconds(0.6);
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    const tags = TagListResponseSchema.parse(response.json).tags;
    expect(tags.find((tag) => tag.name === "carriage.encoder.count")).toEqual({
      name: "carriage.encoder.count",
      type: "integer",
      direction: "feedback",
      value: 1000,
    });
  });
});

describe("sensor edits", () => {
  it("changes a sensor's type, keeping its id and tag key", async () => {
    const changed = await sendJsonRequest(
      axis.server,
      "PATCH",
      "/api/pantins/axis/sensors/extended",
      {
        name: "Extended",
        assembly: "carriage",
        joint: "stroke",
        type: "encoder",
        pulsesPerUnit: 1000,
      },
    );
    expect(SensorResponseSchema.parse(changed.json).sensor).toMatchObject({
      id: "extended",
      tagKey: "extended",
      type: "encoder",
    });
    expect(await tagValues()).toHaveProperty(["carriage.extended.count"], 0);
  });
});

describe("sensor guards", () => {
  it("refuses to delete a watched joint, naming the sensors", async () => {
    await sendRaw(axis.server, "DELETE", "/api/pantins/axis/drives/valve");
    const refused = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.json)).toContain('sensor \\"extended\\", \\"retracted\\"');
    await sendRaw(axis.server, "DELETE", "/api/pantins/axis/sensors/extended");
    const deleted = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/sensors/retracted");
    expect(PantinResponseSchema.parse(deleted.json).document.sensors).toEqual([]);
    expect((await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke")).status).toBe(
      200,
    );
  });

  it("refuses to make a watched joint fixed, naming the sensors", async () => {
    const refused = await sendJsonRequest(axis.server, "PATCH", "/api/pantins/axis/joints/stroke", {
      type: "fixed",
      name: "Stroke",
      parent: "rail",
      child: "carriage",
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.json)).toContain("is watched by sensor");
  });
});

describe("sensor keys", () => {
  it("renames a sensor's tag key, and refuses a key its assembly already uses", async () => {
    const put = (tagKey: string) =>
      sendJsonRequest(axis.server, "PUT", "/api/pantins/axis/sensors/extended/tag-key", { tagKey });
    expect((await put("valve")).status).toBe(409);
    expect(RenamedTagsResponseSchema.parse((await put("sortie")).json).renamedTags).toEqual([
      { from: "carriage.extended.state", to: "carriage.sortie.state" },
    ]);
  });

  it("moves its sensors with an assembly key, reporting their tags as renamed", async () => {
    const response = await sendJsonRequest(
      axis.server,
      "PUT",
      "/api/pantins/axis/assemblies/carriage/key",
      {
        key: "rod",
      },
    );
    const renamed = RenamedTagsResponseSchema.parse(response.json).renamedTags.map((tag) => tag.to);
    expect(renamed).toEqual(expect.arrayContaining(["rod.extended.state", "rod.retracted.state"]));
  });

  it("refuses to delete an assembly that holds a sensor, naming it", async () => {
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/assemblies", { name: "Spare" });
    const moved = await sendJsonRequest(
      axis.server,
      "PATCH",
      "/api/pantins/axis/sensors/extended",
      {
        ...switchAt("Extended", [0.098, 0.1]),
        assembly: "spare",
      },
    );
    expect(SensorResponseSchema.parse(moved.json).sensor.assembly).toBe("spare");
    const refused = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/assemblies/spare");
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.json)).toContain('holds sensor \\"extended\\"');
  });
});
