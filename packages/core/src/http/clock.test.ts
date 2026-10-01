import { SimulationClockStateSchema, TagListResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CylinderAxis, startCylinderAxis } from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// The clock routes (ADR 0032 point 8) on the cylinder axis, a manual clock.

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

const clockRequest = (method: string, path: string, body?: unknown) =>
  sendJsonRequest(axis.server, method, `/api/pantins/axis/clock${path}`, body);

const SWITCH_STATE = "carriage.retracted.state";

function tagValue(list: Awaited<ReturnType<typeof everyTag>>, name: string): number | undefined {
  return list.tags.find((tag) => tag.name === name)?.value;
}

async function addRetractedSwitch(): Promise<void> {
  await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/sensors", {
    name: "Retracted",
    assembly: "carriage",
    joint: "stroke",
    type: "position_switch",
    range: [0, 0.002],
    normallyClosed: false,
  });
}

async function everyTag() {
  return TagListResponseSchema.parse(
    (await sendRaw(axis.server, "GET", "/api/pantins/axis/tags")).json,
  );
}

describe("GET and PUT clock", () => {
  it("answers the state of a Pantin that starts running", async () => {
    const response = await clockRequest("GET", "");
    expect(response.status).toBe(200);
    expect(SimulationClockStateSchema.parse(response.json)).toEqual({
      running: true,
      step: 0,
      stepSeconds: 1 / 120,
      achievedRatio: null,
      droppedSteps: 0,
    });
  });

  it("pauses and resumes, and accepts the current value again", async () => {
    for (const running of [false, false, true, true]) {
      const response = await clockRequest("PUT", "", { running });
      expect(response.status).toBe(200);
      expect(SimulationClockStateSchema.parse(response.json).running).toBe(running);
    }
  });

  it("rejects a body that is not a boolean", async () => {
    expect((await clockRequest("PUT", "", { running: "no" })).status).toBe(400);
    expect((await clockRequest("PUT", "", {})).status).toBe(400);
  });
});

describe("POST clock/step", () => {
  it("is refused with a conflict while the Pantin runs", async () => {
    const response = await clockRequest("POST", "/step", { steps: 1 });
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.json)).toContain("pause it");
  });

  it.each([0, 1201, 1.5, -3, "2"])("rejects %s steps", async (steps) => {
    await clockRequest("PUT", "", { running: false });
    expect((await clockRequest("POST", "/step", { steps })).status).toBe(400);
  });

  it("answers the state after the steps, 1200 being the limit", async () => {
    await clockRequest("PUT", "", { running: false });
    const response = await clockRequest("POST", "/step", { steps: 1200 });
    expect(SimulationClockStateSchema.parse(response.json)).toMatchObject({
      running: false,
      step: 1200,
    });
  });

  it("gives the state n scheduler steps give, bit for bit", async () => {
    await addRetractedSwitch();
    expect(tagValue(await everyTag(), SWITCH_STATE)).toBe(1);
    await axis.writeTag("carriage.valve.coil_14", 1);
    axis.runSeconds(0.25);
    const scheduled = await everyTag();
    // Floating point carry may leave a step short of the ticks: compare as run.
    expect(scheduled.stepCount).toBeGreaterThan(20);
    await axis.close();

    axis = await startCylinderAxis();
    await clockRequest("PUT", "", { running: false });
    await addRetractedSwitch();
    await axis.writeTag("carriage.valve.coil_14", 1);
    await clockRequest("POST", "/step", { steps: scheduled.stepCount });
    const stepped = await everyTag();
    expect(stepped).toEqual(scheduled);
    // The switch left its range during the run: its state is part of the comparison.
    expect(tagValue(stepped, SWITCH_STATE)).toBe(0);
  });
});
