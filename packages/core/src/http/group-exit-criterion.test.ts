import { GroupBodiesResponseSchema, PantinResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  documentOf,
  type GroupedMachine,
  PANTIN_URL,
  runSeconds,
  startGroupedMachine,
  tagNamesOf,
  translationsOf,
} from "../test-support/grouped-machine.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Exit criterion of ADR 0055 slice 2: a machine is made animatable without
// editing a file. Import a one-level STEP file, group the moving bodies, turn
// the fixed joint A -> G into a slider, add a drive and an actuator, write the
// command tag, step the clock; G's bodies move together, A's do not; save and
// reopen.

let machine: GroupedMachine;

beforeEach(async () => {
  machine = await startGroupedMachine();
});

afterEach(async () => {
  await machine.close();
});

const call = (method: string, path: string, body: unknown) =>
  sendJsonRequest(machine.server, method, `${PANTIN_URL}${path}`, body);

async function makeSlideWithCylinder(): Promise<string> {
  const grouping = await call("POST", "/assemblies/machine/groups", {
    name: "Slide",
    bodies: ["rod", "tip"],
    assemblies: [],
  });
  expect(grouping.status).toBe(201);
  const { pantin } = GroupBodiesResponseSchema.parse(grouping.json);
  const holding = pantin.document.joints.find(({ child }) => child.kind === "assembly");
  expect(holding?.type).toBe("fixed");
  const jointId = holding?.id ?? "";
  const slider = await call("PATCH", `/joints/${jointId}`, {
    type: "prismatic",
    name: "Slide",
    parent: { kind: "assembly", key: "machine" },
    child: { kind: "assembly", key: "slide" },
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  });
  expect(slider.status).toBe(200);
  const drive = { name: "Valve", assembly: "slide", type: "valve_5_3_closed" };
  expect((await call("POST", "/drives", drive)).status).toBe(201);
  const actuator = {
    name: "Cylinder",
    assembly: "slide",
    type: "double_acting_cylinder",
    extendSpeed: 0.2,
    retractSpeed: 0.2,
    feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
    joints: [jointId],
  };
  expect((await call("POST", "/actuators", actuator)).status).toBe(201);
  return jointId;
}

function distance([x, y, z]: readonly number[], [a, b, c]: readonly number[]): number {
  return Math.hypot((x ?? 0) - (a ?? 0), (y ?? 0) - (b ?? 0), (z ?? 0) - (c ?? 0));
}

describe("phase 8 exit criterion, slice 2", () => {
  it("animates the grouped bodies together and nothing else", async () => {
    // An import makes no joint inside an assembly (ADR 0055 point 10): nothing to delete.
    expect((await documentOf(machine.server)).joints).toEqual([]);
    const before = await translationsOf(machine.server);
    await makeSlideWithCylinder();
    expect((await tagNamesOf(machine.server)).filter((name) => name.startsWith("slide."))).toEqual(
      expect.arrayContaining(["slide.valve.coil_14", "slide.slide.position"]),
    );
    const written = await call("PUT", "/tags/slide.valve.coil_14", { value: 1 });
    expect(written.status).toBe(200);
    runSeconds(machine.clock, 0.7);
    const after = await translationsOf(machine.server);
    const moved = (id: string) => distance(after.get(id) ?? [], before.get(id) ?? []);
    expect(moved("plate")).toBe(0);
    expect(moved("rod")).toBeCloseTo(0.1, 9);
    expect(moved("tip")).toBeCloseTo(0.1, 9);
    const displacement = (id: string) =>
      (after.get(id) ?? []).map((value, axis) => value - (before.get(id)?.[axis] ?? 0));
    expect(displacement("rod")[0]).toBeCloseTo(0.1, 9);
    expect(displacement("rod")[1]).toBeCloseTo(0, 9);
    expect(displacement("rod")[2]).toBeCloseTo(0, 9);
    expect(displacement("tip")).toEqual(displacement("rod"));
  });

  it("is saved and reopened as it was", async () => {
    await makeSlideWithCylinder();
    const saved = await sendRaw(machine.server, "POST", `${PANTIN_URL}/save`);
    const savedResponse = PantinResponseSchema.parse(saved.json);
    expect(savedResponse.unsavedChanges).toBe(false);
    const tags = await tagNamesOf(machine.server);

    const reopened = await machine.restart();
    const response = PantinResponseSchema.parse((await sendRaw(reopened, "GET", PANTIN_URL)).json);
    expect(response.document).toEqual(savedResponse.document);
    expect(response.unsavedChanges).toBe(false);
    expect(await tagNamesOf(reopened)).toEqual(tags);
    const document = await documentOf(reopened);
    expect(document.joints.map(({ type }) => type)).toEqual(["prismatic"]);
    expect(document.bodies.map(({ id, assembly }) => `${id}:${assembly}`)).toEqual([
      "plate:machine",
      "rod:slide",
      "tip:slide",
    ]);
  });
});
