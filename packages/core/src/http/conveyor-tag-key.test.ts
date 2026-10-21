import {
  ApiErrorResponseSchema,
  RenamedTagsResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startBusAxis } from "../test-support/bus-axis.ts";
import {
  AT_ORIGIN,
  type ConveyorServer,
  EMITTER,
  LINE,
  startConveyorServer,
} from "../test-support/conveyor-server.ts";
import { callIo } from "../test-support/io-edits.ts";
import { testPhysicsWorldFactory } from "../test-support/physics-factory.ts";
import { sendJsonRequest } from "../test-support/test-server.ts";

// PUT .../tag-key of emitters and presence sensors, as for drives (ADR 0043).

const CELL = {
  name: "Cell",
  assembly: "frame",
  placement: AT_ORIGIN,
  type: "photoelectric",
  mode: "diffuse",
  range: 0.6,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0,
};

let line: ConveyorServer;

beforeEach(async () => {
  line = await startConveyorServer();
  await line.send("POST", `${LINE}/emitters`, EMITTER);
  await line.send("POST", `${LINE}/presence-sensors`, CELL);
});

afterEach(async () => {
  await line.close();
});

const rename = (segment: string, id: string, tagKey: unknown) =>
  line.send("PUT", `${LINE}/${segment}/${id}/tag-key`, { tagKey });

describe("renaming the tag key of an emitter", () => {
  it("answers the renamed tags and moves the tag", async () => {
    const answer = await rename("emitters", "source", "feeder");
    expect(answer.status).toBe(200);
    expect(RenamedTagsResponseSchema.parse(answer.json).renamedTags).toEqual([
      { from: "frame.source.spawn", to: "frame.feeder.spawn" },
    ]);
    expect(await line.tags()).toHaveProperty("frame.feeder.spawn");
    expect(await line.tags()).not.toHaveProperty("frame.source.spawn");
  });

  it("keeps the id and counts as an unsaved change", async () => {
    const answer = await rename("emitters", "source", "feeder");
    expect(answer.json).toMatchObject({
      pantin: {
        unsavedChanges: true,
        document: { emitters: [{ id: "source", tagKey: "feeder" }] },
      },
    });
  });
});

describe("forced tags of an emitter", () => {
  it("stay forced, with their value, under the new tag key", async () => {
    await line.send("PUT", `${LINE}/tags/frame.source.spawn`, { value: 1 });
    await rename("emitters", "source", "feeder");
    const { tags } = TagListResponseSchema.parse((await line.send("GET", `${LINE}/tags`)).json);
    expect(tags.find((tag) => tag.name === "frame.feeder.spawn")).toMatchObject({
      value: 1,
      forced: true,
    });
    expect(tags.some((tag) => tag.name === "frame.source.spawn")).toBe(false);
  });
});

describe("renaming the tag key of a presence sensor", () => {
  it("answers the renamed tags and moves the tag", async () => {
    const answer = await rename("presence-sensors", "cell", "eye");
    expect(RenamedTagsResponseSchema.parse(answer.json).renamedTags).toEqual([
      { from: "frame.cell.state", to: "frame.eye.state" },
    ]);
    expect(await line.tags()).toHaveProperty("frame.eye.state");
  });
});

describe("refusals", () => {
  it("refuses a key used in the assembly with a conflict naming a free one", async () => {
    const refused = await rename("presence-sensors", "cell", "source");
    expect(refused.status).toBe(409);
    expect(refused.body).toContain('emitter \\"source\\"');
    expect(refused.body).toContain("source-2");
  });

  it("accepts the key it already has", async () => {
    expect((await rename("emitters", "source", "source")).status).toBe(200);
  });

  it("refuses a key that is not a key, with a 400", async () => {
    const refused = await rename("emitters", "source", "Not a key");
    expect(refused.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(refused.json);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain("tagKey");
  });

  it("answers 404 for an unknown item", async () => {
    expect((await rename("emitters", "ghost", "feeder")).status).toBe(404);
    expect((await rename("presence-sensors", "ghost", "feeder")).status).toBe(404);
  });
});

describe("io.json", () => {
  it("follows a renamed presence sensor and emitter, keeping their channels", async () => {
    const axis = await startBusAxis({ physicsWorldFactory: testPhysicsWorldFactory });
    try {
      const url = "/api/pantins/axis";
      const send = (method: string, path: string, body: unknown) =>
        sendJsonRequest(axis.server, method, `${url}${path}`, body);
      await send("POST", "/presence-sensors", { ...CELL, assembly: "carriage" });
      await send("POST", "/emitters", { ...EMITTER, assembly: "carriage" });
      await callIo(axis, "POST", "/modules", { transport: { kind: "modbus_tcp_slave" } });
      await callIo(axis, "POST", "/modules/m1/channels", {
        tags: ["carriage.cell.state", "carriage.source.spawn"],
      });
      await send("PUT", "/presence-sensors/cell/tag-key", { tagKey: "eye" });
      await send("PUT", "/emitters/source/tag-key", { tagKey: "feeder" });
      const mapping = await callIo(axis, "GET", "");
      const channels = mapping.answer.modules.flatMap((module) => module.channels);
      expect(mapping.answer.status).toBe("valid");
      expect(channels.map((channel) => channel.tag).sort()).toEqual([
        "carriage.eye.state",
        "carriage.feeder.spawn",
      ]);
      expect(channels.map((channel) => channel.owner)).toEqual(
        expect.arrayContaining([
          { kind: "presenceSensor", id: "cell" },
          { kind: "emitter", id: "source" },
        ]),
      );
    } finally {
      await axis.close();
    }
  });
});
