import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import { belt, emitter, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { importBodies } from "./import-operations.ts";
import { deleteBody } from "./mesh-lifecycle.ts";
import { loadPantin } from "./open-pantins.ts";
import { createPantinService, createServiceContext } from "./pantin-service.ts";
import { listTags, writeTag } from "./tag-operations.ts";

// Phase 6 objects through the service (ADR 0043): no route creates them yet,
// so they are put in the open document directly.

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-phase-6-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

async function axisWithRail() {
  const store = createPantinStore(pantinsDirectory);
  await createPantinService(store, undefined).createPantin("Axis");
  const context = createServiceContext(store, undefined, {
    wallClock: () => new Date(0),
    newConsoleId: () => "console",
  });
  const { bodies } = await importBodies(
    context,
    "axis",
    { fileName: "rail.stl", unit: "mm" },
    buildAsciiStl(),
  );
  const rail = bodies[0];
  if (rail === undefined) {
    throw new Error("import returned no body");
  }
  return { context, rail };
}

describe("deleting a body used as a frame", () => {
  it("is refused with a conflict naming the users, and the body stays", async () => {
    const { context, rail } = await axisWithRail();
    const openPantin = await loadPantin(context, "axis");
    openPantin.document = {
      ...openPantin.document,
      absorbers: [
        {
          id: "sink",
          name: "Sink",
          assembly: rail.assembly,
          body: rail.id,
          placement: belt().placement,
          size: [0.1, 0.1, 0.1],
        },
      ],
    };
    const refusal = await deleteBody(context, "axis", rail.id).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).code).toBe("conflict");
    expect((refusal as ApiError).message).toContain('absorber "sink"');
    expect(openPantin.document.bodies.map(({ id }) => id)).toEqual([rail.id]);
  });
});

describe("the tags of emitters and presence sensors", () => {
  it("are listed, and spawn reads back the value written", async () => {
    const { context, rail } = await axisWithRail();
    const openPantin = await loadPantin(context, "axis");
    openPantin.document = {
      ...openPantin.document,
      emitters: [emitter({ assembly: rail.assembly })],
      presenceSensors: [photoelectricCell({ assembly: rail.assembly })],
    };
    const spawn = `${rail.assembly}.source.spawn`;
    const state = `${rail.assembly}.cell.state`;
    expect((await listTags(context, "axis")).tags.map(({ name }) => name)).toEqual([spawn, state]);

    const written = await writeTag(context, "axis", spawn, 1, "client");
    expect(written).toEqual({
      tag: { name: spawn, type: "bit", direction: "command", value: 1, forced: true },
      ignored: null,
    });
    const after = (await listTags(context, "axis")).tags;
    expect(after.map(({ value }) => value)).toEqual([1, 0]);
    await expect(writeTag(context, "axis", spawn, 2, "client")).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(writeTag(context, "axis", state, 1, "client")).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
