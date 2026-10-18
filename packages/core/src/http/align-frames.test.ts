import { AlignFramesResponseSchema, ApiErrorResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  documentOf,
  type GroupedMachine,
  PANTIN_URL,
  startGroupedMachine,
  translationsOf,
} from "../test-support/grouped-machine.ts";
import { sendJsonRequest } from "../test-support/test-server.ts";

// Align the frames on a joint axis over HTTP (ADR 0056). "machine" holds the
// plate, "rod" and "tip" form the group "slide" on a slider from the plate
// along an inclined axis (the group's holding joint "slide" is turned into a
// slider), and "machine" is placed tilted.

let machine: GroupedMachine;

beforeEach(async () => {
  machine = await startGroupedMachine();
  await call("POST", "/assemblies/machine/groups", {
    name: "Slide",
    bodies: ["rod", "tip"],
    assemblies: [],
  });
  await call("PUT", "/assemblies/machine/placement", {
    translation: [0.1, 0.2, 0.3],
    rotation: [0, Math.sin(0.6), 0, Math.cos(0.6)],
  });
  await call("PATCH", "/joints/slide", {
    type: "prismatic",
    name: "Carriage",
    parent: { kind: "body", id: "plate" },
    child: { kind: "assembly", key: "slide" },
    origin: [0, 0, 0],
    axis: [0.94, 0, 0.34],
    limits: [0, 0.5],
  });
  await call("PUT", "/joints/slide/position", { position: 0.2 });
});

afterEach(async () => {
  await machine.close();
});

const call = (method: string, path: string, body?: unknown) =>
  sendJsonRequest(machine.server, method, `${PANTIN_URL}${path}`, body);

describe("POST .../joints/:jointId/align-frames", () => {
  it("rewrites the frames as an unsaved change, lists the joints and keeps the positions", async () => {
    const translationsBefore = await translationsOf(machine.server);
    const saved = await call("POST", "/save", {});
    expect(saved.status).toBe(200);
    const response = await call("POST", "/joints/slide/align-frames");
    expect(response.status).toBe(200);
    const answer = AlignFramesResponseSchema.parse(response.json);
    expect(answer.pantin.unsavedChanges).toBe(true);
    expect(answer.reframedAssemblies).toEqual(["machine", "slide"]);
    expect(answer.rewrittenJoints).toContainEqual({ id: "slide", name: "Carriage" });
    const joint = (await documentOf(machine.server)).joints.find(({ id }) => id === "slide");
    expect(joint?.axis).toEqual([0, 0, 1]);
    const translationsAfter = await translationsOf(machine.server);
    for (const [bodyId, translation] of translationsBefore) {
      translation.forEach((value, index) => {
        expect(translationsAfter.get(bodyId)?.[index]).toBeCloseTo(value, 6);
      });
    }
    const position = await call("GET", "/pose");
    expect(JSON.stringify(position.json)).toContain('{"jointId":"slide","position":0.2}');
  });

  it("answers 409 with advice for a fixed joint and 404 for an unknown joint", async () => {
    await call("PATCH", "/joints/slide", {
      type: "fixed",
      name: "Weld",
      parent: { kind: "body", id: "plate" },
      child: { kind: "assembly", key: "slide" },
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    });
    const fixed = await call("POST", "/joints/slide/align-frames");
    expect(fixed.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(fixed.json).error.message).toContain(
      "a fixed joint has no axis to align with",
    );
    expect((await call("POST", "/joints/ghost/align-frames")).status).toBe(404);
  });
});
