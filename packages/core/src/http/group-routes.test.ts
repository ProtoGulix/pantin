import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ApiErrorResponseSchema,
  GroupBodiesResponseSchema,
  IoMappingResponseSchema,
  PoseResponseSchema,
  UngroupResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  documentOf,
  type GroupedMachine,
  PANTIN_URL,
  startGroupedMachine,
} from "../test-support/grouped-machine.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Grouper and Dégrouper over HTTP (ADR 0055 points 6 to 8). The imported
// machine holds "plate", "rod" and "tip" in "machine"; "rod" and "tip" are
// fixed to "plate" by joints added after the import, since an import makes none.

let machine: GroupedMachine;

beforeEach(async () => {
  machine = await startGroupedMachine(true);
});

afterEach(async () => {
  await machine.close();
});

const post = (path: string, body: unknown = {}) =>
  sendJsonRequest(machine.server, "POST", `${PANTIN_URL}${path}`, body);
const patchJoint = (id: string, body: unknown) =>
  sendJsonRequest(machine.server, "PATCH", `${PANTIN_URL}/joints/${id}`, body);
const messageOf = (response: { json: unknown }) =>
  ApiErrorResponseSchema.parse(response.json).error.message;
const GROUPS = "/assemblies/machine/groups";
const SLIDER = {
  type: "prismatic",
  name: "Rod",
  parent: { kind: "body", id: "plate" },
  child: { kind: "body", id: "rod" },
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.1],
};

describe("POST .../groups", () => {
  it("answers 201 with the group, the deleted fixed joints and the Pantin", async () => {
    const response = await post(GROUPS, { name: "Slide", bodies: ["rod", "tip"], assemblies: [] });
    expect(response.status).toBe(201);
    const answer = GroupBodiesResponseSchema.parse(response.json);
    expect(answer.group).toEqual({ key: "slide", name: "Slide" });
    expect(answer.deletedJoints.map(({ id }) => id).sort()).toEqual(["rod", "tip"]);
    expect(answer.renamedTags).toEqual([]);
    expect(answer.pantin.unsavedChanges).toBe(true);
    const assemblyOf = (id: string) =>
      answer.pantin.document.bodies.find((body) => body.id === id)?.assembly;
    expect(["plate", "rod", "tip"].map(assemblyOf)).toEqual(["machine", "slide", "slide"]);
  });

  it("reports the renamed tags of a moving joint that went into the group", async () => {
    await patchJoint("rod", SLIDER);
    const response = await post(GROUPS, { name: "Slide", bodies: ["rod"], assemblies: [] });
    const { renamedTags, deletedJoints } = GroupBodiesResponseSchema.parse(response.json);
    expect(deletedJoints.map(({ id }) => id)).toEqual([]);
    expect(renamedTags).toContainEqual({ from: "machine.rod.position", to: "slide.rod.position" });
    expect(renamedTags).toContainEqual({ from: "machine.rod.setpoint", to: "slide.rod.setpoint" });
  });

  it("answers 409 naming the body a joint would leave behind, and changes nothing", async () => {
    await patchJoint("tip", {
      ...SLIDER,
      name: "Tip",
      child: { kind: "body", id: "tip" },
      parent: { kind: "body", id: "rod" },
    });
    const before = await documentOf(machine.server);
    const response = await post(GROUPS, { name: "Slide", bodies: ["rod"], assemblies: [] });
    expect(response.status).toBe(409);
    expect(messageOf(response)).toContain('Joint "tip"');
    expect(messageOf(response)).toContain('body "tip"');
    expect(await documentOf(machine.server)).toEqual(before);
  });
});

describe("POST .../groups, the runtime", () => {
  it("keeps the position of a joint that went into the group", async () => {
    await patchJoint("rod", SLIDER);
    await sendJsonRequest(machine.server, "PUT", `${PANTIN_URL}/joints/rod/position`, {
      position: 0.05,
    });
    await post(GROUPS, { name: "Slide", bodies: ["rod"], assemblies: [] });
    const pose = PoseResponseSchema.parse(
      (await sendRaw(machine.server, "GET", `${PANTIN_URL}/pose`)).json,
    );
    expect(pose.jointPositions).toContainEqual({ jointId: "rod", position: 0.05 });
  });
});

describe("POST .../groups, bad requests", () => {
  it("answers 404 for an unknown assembly or an unknown body", async () => {
    const unknownAssembly = await post("/assemblies/ghost/groups", {
      name: "G",
      bodies: ["rod"],
      assemblies: [],
    });
    expect(unknownAssembly.status).toBe(404);
    const unknownBody = await post(GROUPS, { name: "G", bodies: ["ghost"], assemblies: [] });
    expect(unknownBody.status).toBe(404);
    expect(messageOf(unknownBody)).toContain('"ghost"');
  });

  it("answers 400 for an empty group or a missing list", async () => {
    expect((await post(GROUPS, { name: "G", bodies: [], assemblies: [] })).status).toBe(400);
    expect((await post(GROUPS, { name: "G", bodies: ["rod"] })).status).toBe(400);
    expect((await post(GROUPS, { name: " ", bodies: ["rod"], assemblies: [] })).status).toBe(400);
  });
});

describe("POST .../ungroup", () => {
  it("dissolves the group and answers the deleted joint", async () => {
    const before = await documentOf(machine.server);
    await post(GROUPS, { name: "Slide", bodies: ["rod", "tip"], assemblies: [] });
    const response = await post("/assemblies/slide/ungroup");
    expect(response.status).toBe(200);
    const answer = UngroupResponseSchema.parse(response.json);
    expect(answer.deletedJoints).toHaveLength(1);
    expect(answer.pantin.document.assemblies).toEqual(before.assemblies);
    expect(answer.pantin.document.bodies).toEqual(before.bodies);
  });

  it("answers 409 for a top-level assembly and 404 for an unknown one", async () => {
    const topLevel = await post("/assemblies/machine/ungroup");
    expect(topLevel.status).toBe(409);
    expect(messageOf(topLevel)).toContain("top of the structure");
    expect((await post("/assemblies/ghost/ungroup")).status).toBe(404);
  });
});

describe("io.json after grouping", () => {
  it("follows the renamed tags and is written by save", async () => {
    await patchJoint("rod", SLIDER);
    await post("/io/modules", {});
    await post("/io/modules/m1/channels", { tags: ["machine.rod.setpoint"] });
    await post(GROUPS, { name: "Slide", bodies: ["rod"], assemblies: [] });
    const mapping = IoMappingResponseSchema.parse(
      (await sendRaw(machine.server, "GET", `${PANTIN_URL}/io`)).json,
    );
    const tags = mapping.modules.flatMap((module) => module.channels.map((channel) => channel.tag));
    expect(tags).toEqual(["slide.rod.setpoint"]);
    await post("/save", {});
    const saved = await readFile(
      join(machine.workspace.pantinsDirectory, "axis", "io.json"),
      "utf8",
    );
    expect(saved).toContain("slide.rod.setpoint");
    expect(saved).not.toContain("machine.rod.setpoint");
  });
});
