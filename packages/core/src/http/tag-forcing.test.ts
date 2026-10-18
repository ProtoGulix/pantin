import {
  ApiErrorResponseSchema,
  bodyEndpoint,
  groupEndpoint,
  TagListResponseSchema,
  TagResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import {
  type BusAxis,
  COIL_EXTEND,
  COIL_RETRACT,
  POSITION,
  SETPOINT,
  startBusAxis,
} from "../test-support/bus-axis.ts";
import type { BusClient } from "../test-support/bus-client.ts";
import {
  deleteForce,
  deleteForces,
  listTags,
  openRole,
  postRuntime,
  putTag,
  tagNamed,
} from "../test-support/bus-rest.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Forced tags over REST (ADR 0045 point 5, ADR 0031 point 6), and the bit
// check that ends the ADR 0012 point 2 tolerance.

let axis: BusAxis;
const opened: BusClient[] = [];

beforeEach(async () => {
  axis = await startBusAxis({ ioMappingSource: fakeMappingSource([]) });
});

afterEach(async () => {
  for (const connection of opened.splice(0)) {
    connection.socket.terminate();
  }
  await axis.close();
});

describe("PUT tag", () => {
  it("forces the tag it writes and says so", async () => {
    const response = await putTag(axis, COIL_EXTEND, 1);
    expect(response.status).toBe(200);
    expect(TagResponseSchema.parse(response.json).tag).toEqual({
      name: COIL_EXTEND,
      type: "bit",
      direction: "command",
      value: 1,
      forced: true,
    });
    const forced = (await listTags(axis)).filter((tag) => tag.forced).map((tag) => tag.name);
    expect(forced).toEqual([COIL_EXTEND]);
  });

  it.each([2, -1, 0.5, 1.0000001])(
    "refuses %s on a bit with 400 and forces nothing",
    async (value) => {
      const response = await putTag(axis, COIL_EXTEND, value);
      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.parse(response.json).error.message).toContain("bit");
      expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
    },
  );

  it("accepts 0 and 1 on a bit, and any finite number on a float", async () => {
    expect((await putTag(axis, COIL_EXTEND, 0)).status).toBe(200);
    expect((await putTag(axis, COIL_EXTEND, 1)).status).toBe(200);
    expect((await putTag(axis, SETPOINT, 0.0123)).status).toBe(200);
    expect((await putTag(axis, SETPOINT, -3)).status).toBe(200);
  });
});

describe("DELETE tag force", () => {
  it("releases one tag and answers it", async () => {
    await putTag(axis, COIL_EXTEND, 1);
    await putTag(axis, COIL_RETRACT, 1);
    const response = await deleteForce(axis, COIL_EXTEND);
    expect(response.status).toBe(200);
    expect(TagResponseSchema.parse(response.json).tag).toMatchObject({
      name: COIL_EXTEND,
      value: 1,
      forced: false,
    });
    expect(await tagNamed(axis, COIL_RETRACT)).toMatchObject({ forced: true });
  });

  it("is idempotent: a tag that is not forced stays as it is", async () => {
    const response = await deleteForce(axis, COIL_EXTEND);
    expect(response.status).toBe(200);
    expect(TagResponseSchema.parse(response.json).tag).toMatchObject({ value: 0, forced: false });
  });

  it("re-applies the last value the PLC wrote", async () => {
    const plc = await openRole(axis, "plc", opened);
    await putTag(axis, COIL_EXTEND, 1);
    plc.send({ type: "write", id: "p1", tag: COIL_EXTEND, value: 0 });
    expect((await plc.next("ack")).ignored).toBe("forced");
    const response = await deleteForce(axis, COIL_EXTEND);
    expect(TagResponseSchema.parse(response.json).tag).toMatchObject({ value: 0, forced: false });
  });

  it.each([
    ["an unknown tag", "carriage.valve.nothing", 404],
    ["a feedback tag", POSITION, 400],
    ["a name that is not a tag name", "stroke", 400],
  ])("refuses %s", async (_name, tag, status) => {
    expect((await deleteForce(axis, tag)).status).toBe(status);
  });
});

describe("DELETE forces", () => {
  it("releases every forced tag and answers the tag list", async () => {
    await putTag(axis, COIL_EXTEND, 1);
    await putTag(axis, SETPOINT, 0.05);
    const response = await deleteForces(axis);
    expect(response.status).toBe(200);
    const { tags } = TagListResponseSchema.parse(response.json);
    expect(tags.every((tag) => !tag.forced)).toBe(true);
    expect(tags.find((tag) => tag.name === SETPOINT)?.value).toBe(0.05);
  });

  it("is a 200 when nothing is forced", async () => {
    expect((await deleteForces(axis)).status).toBe(200);
  });
});

describe("runtime state", () => {
  it("is cleared by a reset: no force is left", async () => {
    await putTag(axis, COIL_EXTEND, 1);
    await postRuntime(axis, "reset");
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
  });

  it("is not inherited by a new element that takes the id of a deleted one", async () => {
    await putTag(axis, SETPOINT, 0.05);
    await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/joints", {
      type: "prismatic",
      name: "Stroke",
      parent: bodyEndpoint("rail"),
      child: groupEndpoint("carriage"),
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    });
    axis.runSeconds(STEP_SECONDS);
    expect(await tagNamed(axis, SETPOINT)).toMatchObject({ value: 0, forced: false });
  });

  it("does not give a deleted drive's force to a new drive of the same name", async () => {
    await putTag(axis, COIL_EXTEND, 1);
    await sendRaw(axis.server, "DELETE", "/api/pantins/axis/drives/valve");
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/drives", {
      name: "Valve",
      assembly: "carriage",
      type: "valve_5_3_closed",
    });
    expect(await tagNamed(axis, COIL_EXTEND)).toMatchObject({ value: 0, forced: false });
  });

  it("follows a tag key rename: the tag stays forced under its new name", async () => {
    await putTag(axis, SETPOINT, 0.05);
    await sendJsonRequest(axis.server, "PUT", "/api/pantins/axis/joints/stroke/tag-key", {
      tagKey: "course",
    });
    expect(await tagNamed(axis, "carriage.course.setpoint")).toMatchObject({
      value: 0.05,
      forced: true,
    });
  });
});
