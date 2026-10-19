import type { CreateJointRequest, PantinDocument } from "@pantin/protocol";
import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  absorber,
  belt,
  conveyorDocument,
  emitter,
  guide,
  photoelectricCell,
} from "../test-support/conveyor-fixtures.ts";
import { expectConflict } from "../test-support/expect-conflict.ts";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { renameAssemblyKey } from "./assembly-edits.ts";
import { framedUsersOfBody, refuseBodyUsedAsFrame } from "./conveyor-rules.ts";
import { deleteJointFromDocument, updateJointInDocument } from "./joint-rules.ts";
import { moveBody } from "./move-body.ts";
import { tagKeyOwners } from "./tag-keys.ts";

// What phase 6 objects forbid to bodies and joints (ADR 0043 point 12).

function documentWithFrames(): PantinDocument {
  return conveyorDocument({
    belts: [belt({ body: "frame" })],
    guides: [guide({ body: "frame" }), guide({ id: "free" })],
    emitters: [emitter({ body: "roller" })],
    absorbers: [absorber({ body: "frame" })],
    presenceSensors: [photoelectricCell({ body: "frame" })],
  });
}

describe("bodies used as a frame", () => {
  it("lists every object that follows the body, by kind", () => {
    expect(framedUsersOfBody(documentWithFrames(), "frame")).toEqual([
      'belt "feed"',
      'guide "rail"',
      'absorber "sink"',
      'presence sensor "cell"',
    ]);
    expect(framedUsersOfBody(documentWithFrames(), "bench")).toEqual([]);
  });

  it("refuses the change with a conflict naming the users", () => {
    expectConflict(
      () => refuseBodyUsedAsFrame(documentWithFrames(), "roller", "be deleted"),
      'Body "roller" cannot be deleted',
      'emitter "source"',
    );
    expect(() => refuseBodyUsedAsFrame(documentWithFrames(), "bench", "be deleted")).not.toThrow();
  });

  it("refuses to move the body to another assembly, and allows staying put", () => {
    expectConflict(
      () => moveBody(documentWithFrames(), "frame", "line"),
      'cannot move to assembly "line"',
      'belt "feed"',
    );
    const moved = moveBody(conveyorDocument({ joints: [] }), "frame", "line").document;
    expect(moved.bodies.find((candidate) => candidate.id === "frame")?.assembly).toBe("line");
  });
});

describe("the drum joint", () => {
  const withBelt = () => conveyorDocument({ belts: [belt(), belt({ id: "second" })] });

  it("cannot be deleted while a belt turns on it", () => {
    expectConflict(
      () => deleteJointFromDocument(withBelt(), "drum", NO_POSITIONS),
      'Joint "drum" cannot be deleted',
      '"feed", "second"',
    );
    const without = deleteJointFromDocument(conveyorDocument(), "drum", NO_POSITIONS);
    expect(without.joints).toEqual([]);
  });

  it("cannot become another joint type", () => {
    const retyped: CreateJointRequest = {
      name: "drum",
      type: "fixed",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("roller"),
      origin: [0, 0, 0],
      axis: [0, 1, 0],
    };
    expectConflict(
      () => updateJointInDocument(withBelt(), "drum", retyped, NO_POSITIONS),
      "cannot become a fixed joint",
      '"feed"',
    );
  });

  it("may be edited while it stays continuous", () => {
    const renamed: CreateJointRequest = {
      name: "Drum, renamed",
      type: "continuous",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("roller"),
      origin: [0, 0, 0],
      axis: [0, 1, 0],
    };
    const { document } = updateJointInDocument(withBelt(), "drum", renamed, NO_POSITIONS);
    expect(document.joints.find((candidate) => candidate.id === "drum")?.name).toBe(
      "Drum, renamed",
    );
  });
});

describe("tag keys of emitters and presence sensors", () => {
  const document = conveyorDocument({
    emitters: [emitter()],
    presenceSensors: [photoelectricCell()],
  });

  it("are owned in their own assembly, with the joint tag keys", () => {
    expect(tagKeyOwners(document, "main")).toEqual(
      new Map([
        ["drum", 'joint "drum"'],
        ["source", 'emitter "source"'],
        ["cell", 'presence sensor "cell"'],
      ]),
    );
    expect(tagKeyOwners(document, "line").size).toBe(0);
  });

  it("leave out the excepted owner", () => {
    const owners = tagKeyOwners(document, "main", {
      emitterId: "source",
      presenceSensorId: "cell",
    });
    expect([...owners.keys()]).toEqual(["drum"]);
  });
});

describe("renaming an assembly key", () => {
  it("moves its phase 6 objects with it, so the document stays valid", () => {
    const renamed = renameAssemblyKey(
      conveyorDocument({
        belts: [belt()],
        guides: [guide()],
        emitters: [emitter()],
        absorbers: [absorber()],
        presenceSensors: [photoelectricCell()],
      }),
      "main",
      "cell_line",
    );
    for (const items of [
      renamed.belts,
      renamed.guides,
      renamed.emitters,
      renamed.absorbers,
      renamed.presenceSensors,
    ]) {
      expect(items.map(({ assembly }) => assembly)).toEqual(["cell_line"]);
    }
  });
});
