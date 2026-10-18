import { ApiErrorResponseSchema, MoveBodyResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type GroupedMachine,
  PANTIN_URL,
  startGroupedMachine,
} from "../test-support/grouped-machine.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// PUT .../bodies/:bodyId/assembly answers the fixed joints it deleted
// (ADR 0055 point 11). The machine holds "plate", "rod" and "tip" in
// "machine", "rod" and "tip" fixed to "plate".

let machine: GroupedMachine;

beforeEach(async () => {
  machine = await startGroupedMachine(true);
});

afterEach(async () => {
  await machine.close();
});

const call = (method: string, path: string, body: unknown) =>
  sendJsonRequest(machine.server, method, `${PANTIN_URL}${path}`, body);

describe("PUT .../bodies/:bodyId/assembly", () => {
  it("lists the fixed joint to the old assembly it deleted", async () => {
    await call("POST", "/assemblies", { name: "Spare" });
    const response = await call("PUT", "/bodies/rod/assembly", { assembly: "spare" });
    expect(response.status).toBe(200);
    const answer = MoveBodyResponseSchema.parse(response.json);
    expect(answer.deletedJoints).toEqual([{ id: "rod", name: "rod" }]);
    expect(answer.renamedTags).toEqual([]);
    expect(answer.pantin.document.joints.map(({ id }) => id)).toEqual(["tip"]);
    expect(answer.pantin.document.bodies.find(({ id }) => id === "rod")?.assembly).toBe("spare");
  });

  it("answers 409 naming a moving joint to the old assembly, and changes nothing", async () => {
    await call("POST", "/assemblies", { name: "Spare" });
    await call("PATCH", "/joints/rod", {
      type: "prismatic",
      name: "Rod",
      parent: { kind: "body", id: "plate" },
      child: { kind: "body", id: "rod" },
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    });
    const before = await sendRaw(machine.server, "GET", PANTIN_URL);
    const response = await call("PUT", "/bodies/rod/assembly", { assembly: "spare" });
    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(response.json).error.message).toContain('Joint "rod"');
    expect((await sendRaw(machine.server, "GET", PANTIN_URL)).json).toEqual(before.json);
  });
});
