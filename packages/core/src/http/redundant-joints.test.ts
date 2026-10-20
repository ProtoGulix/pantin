import {
  ApiErrorResponseSchema,
  FaultsResponseSchema,
  PantinResponseSchema,
  PoseResponseSchema,
  RedundantJointsDeletionResponseSchema,
  RedundantJointsListSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  documentOf,
  type GroupedMachine,
  PANTIN_URL,
  startGroupedMachine,
} from "../test-support/grouped-machine.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// The fixed joints that groups made redundant, over HTTP (ADR 0060). The
// imported machine holds "plate", "rod" and "tip" in "machine"; "rod" and "tip"
// are fixed to "plate", which no joint moves, so both are redundant.

let machine: GroupedMachine;

beforeEach(async () => {
  machine = await startGroupedMachine(true);
});

afterEach(async () => {
  await machine.close();
});

const REDUNDANT = `${PANTIN_URL}/redundant-joints`;
const post = (body: unknown) =>
  sendJsonRequest(machine.server, "POST", `${REDUNDANT}/delete`, body);
const jointIds = async () => (await documentOf(machine.server)).joints.map(({ id }) => id);
const unsavedChanges = async () => {
  const response = await sendRaw(machine.server, "GET", PANTIN_URL);
  return PantinResponseSchema.parse(response.json).unsavedChanges;
};
const poseOf = async () =>
  PoseResponseSchema.parse((await sendRaw(machine.server, "GET", `${PANTIN_URL}/pose`)).json);
const jammedJoints = async () =>
  FaultsResponseSchema.parse((await sendRaw(machine.server, "GET", `${PANTIN_URL}/faults`)).json)
    .jammedJoints;
const jam = (jointId: string) =>
  sendJsonRequest(machine.server, "PUT", `${PANTIN_URL}/joints/${jointId}/fault`, {
    fault: "jammed",
  });

describe("GET .../redundant-joints", () => {
  it("lists the redundant joints and changes nothing", async () => {
    await sendRaw(machine.server, "POST", `${PANTIN_URL}/save`);
    const before = await documentOf(machine.server);
    const response = await sendRaw(machine.server, "GET", REDUNDANT);
    expect(response.status).toBe(200);
    const list = RedundantJointsListSchema.parse(response.json);
    expect(list.redundant.map(({ id }) => id)).toEqual(["rod", "tip"]);
    expect(list.kept).toEqual([]);
    expect(await documentOf(machine.server)).toEqual(before);
    expect(await unsavedChanges()).toBe(false);
  });

  it("answers 404 for an unknown Pantin", async () => {
    const response = await sendRaw(machine.server, "GET", "/api/pantins/nope/redundant-joints");
    expect(response.status).toBe(404);
  });
});

describe("POST .../redundant-joints/delete", () => {
  it("deletes the requested redundant joints, flags unsaved changes and keeps the poses", async () => {
    const posesBefore = (await poseOf()).bodies;
    await sendRaw(machine.server, "POST", `${PANTIN_URL}/save`);
    const response = await post({ jointIds: ["rod", "tip"] });
    expect(response.status).toBe(200);
    const answer = RedundantJointsDeletionResponseSchema.parse(response.json);
    expect(answer.deletedJoints.map(({ id }) => id)).toEqual(["rod", "tip"]);
    expect(answer.skipped).toEqual([]);
    expect(answer.pantin.unsavedChanges).toBe(true);
    expect(await jointIds()).toEqual([]);
    expect((await poseOf()).bodies).toEqual(posesBefore);
  });

  it("forgets the runtime state of the deleted joints only", async () => {
    // A fixed joint can still be jammed through the fault route, which makes
    // the jam a visible trace of the runtime state.
    await jam("rod");
    await jam("tip");
    await post({ jointIds: ["rod"] });
    expect(await jammedJoints()).toEqual(["tip"]);
  });
});

describe("POST .../redundant-joints/delete with a stale or invalid request", () => {
  it("deletes only the intersection and reports the rest as skipped", async () => {
    const response = await post({ jointIds: ["rod", "plate", "gone"] });
    const answer = RedundantJointsDeletionResponseSchema.parse(response.json);
    expect(answer.deletedJoints.map(({ id }) => id)).toEqual(["rod"]);
    expect(answer.skipped).toEqual(["plate", "gone"]);
    expect(await jointIds()).toEqual(["tip"]);
  });

  it("does not delete a joint that stopped being redundant", async () => {
    await sendJsonRequest(machine.server, "PATCH", `${PANTIN_URL}/joints/rod`, {
      type: "prismatic",
      name: "Rod",
      parent: { kind: "body", id: "plate" },
      child: { kind: "body", id: "rod" },
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    });
    const answer = RedundantJointsDeletionResponseSchema.parse(
      (await post({ jointIds: ["rod"] })).json,
    );
    expect(answer.deletedJoints).toEqual([]);
    expect(answer.skipped).toEqual(["rod"]);
    expect(await jointIds()).toContain("rod");
  });

  it.each([{}, { jointIds: [] }, { jointIds: [1] }, { jointIds: "rod" }])(
    "answers 400 for the body %j",
    async (body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.parse(response.json).error.message).toContain(
        "redundant joint deletion request",
      );
    },
  );
});
