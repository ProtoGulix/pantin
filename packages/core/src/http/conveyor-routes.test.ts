import { bodyEndpoint, groupEndpoint, PantinResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AT_ORIGIN,
  BELT,
  type ConveyorServer,
  EMITTER,
  LINE,
  startConveyorServer,
} from "../test-support/conveyor-server.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { importMesh } from "../test-support/test-server.ts";

// Create, replace and delete routes of belts, guides, emitters, absorbers and
// presence sensors (ADR 0043 point 12), and the refusals they depend on.

let line: ConveyorServer;

// The item of a response such as `{ belt: {...} }`, checked, not cast.
const ItemResponseSchema = z.record(
  z.string(),
  z.looseObject({ id: z.string(), tagKey: z.string().optional() }),
);

function itemIn(json: unknown, key: string) {
  const item = ItemResponseSchema.parse(json)[key];
  if (item === undefined) {
    throw new Error(`The response has no "${key}".`);
  }
  return item;
}

beforeEach(async () => {
  line = await startConveyorServer();
});

afterEach(async () => {
  await line.close();
});

const SIZE = [0.2, 0.1, 0.3];
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

// segment, response key, a valid body, and the same body with a changed field.
const KINDS = [
  { segment: "belts", key: "belt", body: BELT, change: { length: 2 } },
  {
    segment: "guides",
    key: "guide",
    body: { name: "Rail", assembly: "frame", placement: AT_ORIGIN, size: SIZE },
    change: { size: [1, 1, 1] },
  },
  {
    segment: "emitters",
    key: "emitter",
    body: EMITTER,
    change: { box: { ...EMITTER.box, mass: 3 } },
  },
  {
    segment: "absorbers",
    key: "absorber",
    body: { name: "Sink", assembly: "frame", placement: AT_ORIGIN, size: SIZE },
    change: { size: [1, 1, 1] },
  },
  { segment: "presence-sensors", key: "presenceSensor", body: CELL, change: { range: 1.2 } },
] as const;

describe.each(KINDS)("$segment", ({ segment, key, body, change }) => {
  const path = `${LINE}/${segment}`;

  it("creates one with an id derived from its name, as an unsaved change", async () => {
    const created = await line.send("POST", path, body);
    expect(created.status).toBe(201);
    const item = itemIn(created.json, key);
    expect(item.id).toBe(body.name.toLowerCase().replace(" ", "-"));
    const again = await line.send("POST", path, body);
    expect(itemIn(again.json, key).id).toBe(`${item.id}-2`);
    expect(PantinResponseSchema.parse((await line.send("GET", LINE)).json).unsavedChanges).toBe(
      true,
    );
  });

  it("replaces every field but the id, keeping its tag key", async () => {
    const before = itemIn((await line.send("POST", path, body)).json, key);
    const replaced = await line.send("PATCH", `${path}/${before.id}`, {
      ...body,
      name: "Renamed",
      ...change,
    });
    expect(replaced.status).toBe(200);
    const after = itemIn(replaced.json, key);
    expect(after).toMatchObject({ id: before.id, name: "Renamed", ...change });
    expect(after.tagKey).toBe(before.tagKey);
  });

  it("deletes one and answers the Pantin", async () => {
    await line.send("POST", path, body);
    const id = body.name.toLowerCase().replace(" ", "-");
    const deleted = await line.send("DELETE", `${path}/${id}`);
    expect(deleted.status).toBe(200);
    const document = PantinResponseSchema.parse(deleted.json).document;
    const { belts, guides, emitters, absorbers, presenceSensors } = document;
    expect([belts, guides, emitters, absorbers, presenceSensors].flat()).toEqual([]);
  });
});

describe.each(KINDS)("$segment refusals", ({ segment, body }) => {
  const path = `${LINE}/${segment}`;

  it("answers 404 for an unknown id on replacement and deletion", async () => {
    const replaced = await line.send("PATCH", `${path}/ghost`, body);
    const deleted = await line.send("DELETE", `${path}/ghost`);
    expect([replaced.status, deleted.status, deleted.body]).toEqual([
      404,
      404,
      expect.stringContaining("has no"),
    ]);
  });

  it("answers 400 for an unknown assembly, naming it", async () => {
    const refused = await line.send("POST", path, { ...body, assembly: "ghost" });
    expect(refused.status).toBe(400);
    expect(refused.body).toContain('assembly \\"ghost\\"');
  });

  it("answers 400 for a body that is not an object of its kind", async () => {
    const refused = await line.send("POST", path, { name: "Nothing" });
    expect(refused.status).toBe(400);
  });
});

describe("validation of values", () => {
  it("refuses a belt turning on a joint that is not continuous", async () => {
    await line.send("POST", `${LINE}/joints`, {
      type: "revolute",
      name: "Hinge",
      parent: bodyEndpoint("frame"),
      child: groupEndpoint("roller"),
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: [0, 1],
    });
    const refused = await line.send("POST", `${LINE}/belts`, { ...BELT, drumJoint: "hinge" });
    expect(refused.status).toBe(400);
    expect(refused.body).toContain("not a continuous joint");
  });

  it("refuses a length that is not positive", async () => {
    const refused = await line.send("POST", `${LINE}/belts`, { ...BELT, length: 0 });
    expect(refused.status).toBe(400);
    expect(refused.body).toContain("belt length");
  });

  it("refuses a body that belongs to another assembly", async () => {
    const refused = await line.send("POST", `${LINE}/guides`, {
      name: "Rail",
      assembly: "frame",
      body: "roller",
      placement: AT_ORIGIN,
      size: SIZE,
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toContain("Pick a body of its assembly");
  });
});

describe("tag keys", () => {
  it("derives the tag key of an emitter and a presence sensor from the name", async () => {
    const emitter = await line.send("POST", `${LINE}/emitters`, EMITTER);
    const cell = await line.send("POST", `${LINE}/presence-sensors`, CELL);
    expect(emitter.json).toMatchObject({ emitter: { id: "source", tagKey: "source" } });
    expect(cell.json).toMatchObject({ presenceSensor: { id: "cell", tagKey: "cell" } });
    expect(await line.tags()).toMatchObject({ "frame.source.spawn": 0, "frame.cell.state": 0 });
  });

  it("suffixes a key another owner of the assembly already uses", async () => {
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    const second = await line.send("POST", `${LINE}/presence-sensors`, { ...CELL, name: "Source" });
    expect(second.json).toMatchObject({ presenceSensor: { id: "source", tagKey: "source-2" } });
  });

  it("refuses to move an item to an assembly where its tag key is taken, with a conflict", async () => {
    // The drum joint owns tag key "drum" in the assembly of its child, "roller".
    await line.send("POST", `${LINE}/emitters`, { ...EMITTER, name: "Drum" });
    const refused = await line.send("PATCH", `${LINE}/emitters/drum`, {
      ...EMITTER,
      name: "Drum",
      assembly: "roller",
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toContain('joint \\"drum\\"');
  });
});

describe("refusals reachable over HTTP", () => {
  it("refuses to delete a body used as a frame, naming the users", async () => {
    await importMesh(line.server, "line", "fileName=bench.stl&unit=mm", buildAsciiStl());
    await line.send("POST", `${LINE}/belts`, { ...BELT, assembly: "bench", body: "bench" });
    const refused = await line.send("DELETE", `${LINE}/bodies/bench`);
    expect(refused.status).toBe(409);
    expect(refused.body).toContain('belt \\"feed-belt\\"');
    expect((await line.document()).bodies.map(({ id }) => id)).toContain("bench");
  });

  it("refuses to delete a drum joint, naming the belt", async () => {
    await line.send("POST", `${LINE}/belts`, BELT);
    const refused = await line.send("DELETE", `${LINE}/joints/drum`);
    expect(refused.status).toBe(409);
    expect(refused.body).toContain('drum of belt \\"feed-belt\\"');
  });

  it("refuses to change the type of a drum joint", async () => {
    await line.send("POST", `${LINE}/belts`, BELT);
    const refused = await line.send("PATCH", `${LINE}/joints/drum`, {
      type: "revolute",
      name: "Drum",
      parent: bodyEndpoint("frame"),
      child: groupEndpoint("roller"),
      origin: [0, 0, 0],
      axis: [0, 1, 0],
      limits: [-1, 1],
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toContain("feed-belt");
    expect((await line.document()).joints[0]?.type).toBe("continuous");
  });

  it("deletes the objects of an assembly with its contents, and only those", async () => {
    await line.send("POST", `${LINE}/assemblies`, { name: "Spare" });
    await line.send("POST", `${LINE}/emitters`, { ...EMITTER, assembly: "spare" });
    await line.send("POST", `${LINE}/guides`, {
      name: "Rail",
      assembly: "spare",
      placement: AT_ORIGIN,
      size: SIZE,
    });
    await line.send("POST", `${LINE}/belts`, BELT);
    const deleted = await line.send("DELETE", `${LINE}/assemblies/spare?contents=delete`);
    expect(deleted.status).toBe(200);
    const document = await line.document();
    expect([document.emitters, document.guides]).toEqual([[], []]);
    expect(document.belts).toHaveLength(1);
  });
});
