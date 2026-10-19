import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bodyEndpoint } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPantinStore } from "../store/pantin-store.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { assemblyOperations } from "./assembly-operations.ts";
import { importBodies } from "./import-operations.ts";
import { createJoint } from "./joint-operations.ts";
import { loadPantin } from "./open-pantins.ts";
import { createPantinService, createServiceContext } from "./pantin-service.ts";

// A fixed joint deleted by a body move leaves the runtime too (ADR 0055
// point 11): a joint created later under its id must start at 0.

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-move-body-runtime-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

describe("moving a body that deletes a fixed joint", () => {
  it("forgets the runtime state of that joint", async () => {
    const store = createPantinStore(pantinsDirectory);
    await createPantinService(store, undefined).createPantin("Axis");
    const context = createServiceContext(store, undefined, {
      wallClock: () => new Date(0),
      newConsoleId: () => "console",
    });
    for (const fileName of ["first.stl", "second.stl"]) {
      await importBodies(context, "axis", { fileName, unit: "mm" }, buildAsciiStl());
    }
    const operations = assemblyOperations(context);
    await operations.moveBody("axis", "second", "first");
    await createJoint(context, "axis", {
      type: "fixed",
      name: "Weld",
      parent: bodyEndpoint("first"),
      child: bodyEndpoint("second"),
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    });
    const openPantin = await loadPantin(context, "axis");
    openPantin.jointPositions.set("weld", 0.5);

    const answer = await operations.moveBody("axis", "second", "second");

    expect(answer.deletedJoints).toEqual([{ id: "weld", name: "Weld" }]);
    expect(openPantin.jointPositions.has("weld")).toBe(false);
  });
});
