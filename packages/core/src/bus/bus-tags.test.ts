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
import { listTags, openRole, putTag } from "../test-support/bus-rest.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";

// Subscribing, snapshots and the tags message (ADR 0045 point 4).

let axis: BusAxis;
const opened: BusClient[] = [];

beforeEach(async () => {
  axis = await startBusAxis({ ioMappingSource: fakeMappingSource([]) });
});

afterEach(async () => {
  for (const client of opened.splice(0)) {
    client.socket.terminate();
  }
  await axis.close();
});

const tick = () => axis.runSeconds(STEP_SECONDS);

describe("subscribe and snapshot", () => {
  it("answers a subscription to every tag with a snapshot of all of them, none forced", async () => {
    const client = await openRole(axis, "client", opened);
    client.send({ type: "subscribe", tags: "*" });
    const snapshot = await client.next("snapshot");
    const restNames = (await listTags(axis)).map((tag) => tag.name).sort();
    expect(snapshot.tags.map((tag) => tag.name).sort()).toEqual(restNames);
    expect(snapshot.tags.every((tag) => !tag.forced && tag.value === 0)).toBe(true);
    expect(snapshot.step).toBe(0);
  });

  it("covers the named tags only, and a new subscription replaces the old one", async () => {
    const client = await openRole(axis, "client", opened);
    client.send({ type: "subscribe", tags: [SETPOINT, COIL_EXTEND] });
    expect((await client.next("snapshot")).tags.map((tag) => tag.name)).toEqual([
      SETPOINT,
      COIL_EXTEND,
    ]);
    client.send({ type: "subscribe", tags: [COIL_RETRACT] });
    expect((await client.next("snapshot")).tags.map((tag) => tag.name)).toEqual([COIL_RETRACT]);
  });

  it("answers an unknown tag with an error and keeps the connection and the subscription", async () => {
    const client = await openRole(axis, "client", opened);
    client.send({ type: "subscribe", tags: [COIL_EXTEND] });
    await client.next("snapshot");
    client.send({ type: "subscribe", tags: [COIL_EXTEND, "carriage.valve.nothing"] });
    const error = await client.next("error");
    expect(error).toMatchObject({ id: null, code: "not_found" });
    expect(error.message).toContain("carriage.valve.nothing");
    await putTag(axis, COIL_EXTEND, 1);
    tick();
    expect((await client.next("tags")).tags).toEqual([
      { name: COIL_EXTEND, value: 1, forced: true },
    ]);
  });

  it("sends nothing but the answer to a connection that did not subscribe", async () => {
    const client = await openRole(axis, "client", opened);
    await putTag(axis, COIL_EXTEND, 1);
    tick();
    await client.barrier();
    expect(client.received.filter((message) => message.type === "tags")).toEqual([]);
  });
});

describe("the tags message", () => {
  it("carries only the items that changed since the last one, with the step", async () => {
    const client = await openRole(axis, "client", opened);
    client.send({ type: "subscribe", tags: "*" });
    await client.next("snapshot");
    tick();
    await client.barrier();
    expect(client.received.filter((message) => message.type === "tags")).toEqual([]);

    await putTag(axis, SETPOINT, 0.05);
    tick();
    const first = await client.next("tags");
    expect(first.step).toBe(2);
    const names = first.tags.map((tag) => tag.name);
    expect(names).toEqual(expect.arrayContaining([SETPOINT, POSITION]));
    expect(first.tags.find((tag) => tag.name === SETPOINT)).toEqual({
      name: SETPOINT,
      value: 0.05,
      forced: true,
    });
    expect(names).not.toContain(COIL_EXTEND);

    // The joint reached its setpoint at once: nothing changes at the next tick.
    tick();
    await client.barrier();
    expect(client.received.filter((message) => message.type === "tags")).toEqual([]);
  });

  it("reports a force that changes and a value that stays", async () => {
    const client = await openRole(axis, "client", opened);
    const plc = await openRole(axis, "plc", opened);
    plc.send({ type: "write", id: "w1", tag: COIL_EXTEND, value: 1 });
    await plc.next("ack");
    client.send({ type: "subscribe", tags: [COIL_EXTEND] });
    expect((await client.next("snapshot")).tags).toEqual([
      { name: COIL_EXTEND, value: 1, forced: false },
    ]);
    // Same value, now forced: the force alone is a change.
    await putTag(axis, COIL_EXTEND, 1);
    tick();
    expect((await client.next("tags")).tags).toEqual([
      { name: COIL_EXTEND, value: 1, forced: true },
    ]);
  });
});
