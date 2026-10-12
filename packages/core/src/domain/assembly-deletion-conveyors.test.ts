import type { Joint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  absorber,
  belt,
  drumJoint,
  emitter,
  guide,
  photoelectricCell,
} from "../test-support/conveyor-fixtures.ts";
import { expectConflict } from "../test-support/expect-conflict.ts";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { documentOf } from "../test-support/placed-fixtures.ts";
import { deleteAssemblyWithContents } from "./assembly-deletion.ts";
import { deleteAssembly } from "./assembly-edits.ts";

// Deleting an assembly that holds phase 6 objects (ADR 0043, ADR 0037).

const drum: Joint = { ...drumJoint(), parent: "frame", child: "carriage" };
const withObjects = () =>
  documentOf([drum], undefined, undefined, {
    belts: [belt({ assembly: "chape", drumJoint: "drum" })],
    guides: [guide({ assembly: "chape" }), guide({ id: "kept", assembly: "other" })],
    emitters: [emitter({ assembly: "chape" })],
    absorbers: [absorber({ assembly: "chape" })],
    presenceSensors: [photoelectricCell({ assembly: "chape" })],
  });

describe("phase 6 objects (ADR 0043)", () => {
  it("removes the belts, guides, emitters, absorbers and presence sensors of the assembly and lists them", () => {
    const { document, deletion } = deleteAssemblyWithContents(withObjects(), "chape", NO_POSITIONS);
    expect(document.belts).toEqual([]);
    expect(document.guides.map(({ id }) => id)).toEqual(["kept"]);
    expect(document.emitters).toEqual([]);
    expect(document.absorbers).toEqual([]);
    expect(document.presenceSensors).toEqual([]);
    expect(deletion.belts).toEqual([{ id: "feed", name: "Feed belt" }]);
    expect(deletion.guides).toEqual([{ id: "rail", name: "Rail" }]);
    expect(deletion.emitters).toEqual([{ id: "source", name: "Source" }]);
    expect(deletion.absorbers).toEqual([{ id: "sink", name: "Sink" }]);
    expect(deletion.presenceSensors).toEqual([{ id: "cell", name: "Cell" }]);
    // The emitter's and the cell's tags go with them.
    expect(deletion.removedTags).toEqual(
      expect.arrayContaining(["chape.source.spawn", "chape.cell.state"]),
    );
  });

  it("is refused while an object of another assembly follows a removed body", () => {
    const before = withObjects();
    const document = {
      ...before,
      guides: [guide({ id: "kept", assembly: "other", body: "clevis" })],
    };
    expectConflict(
      () => deleteAssemblyWithContents(document, "chape", NO_POSITIONS),
      'Guide "Rail" follows body "clevis"',
    );
  });

  it("is refused while a belt of another assembly turns on a removed drum", () => {
    const before = withObjects();
    const document = { ...before, belts: [belt({ assembly: "other", drumJoint: "drum" })] };
    expectConflict(
      () => deleteAssemblyWithContents(document, "main", NO_POSITIONS),
      'Belt "Feed belt" turns on joint "drum", which would be deleted',
    );
  });

  it("keeps a plain deletion refused for an assembly that holds objects", () => {
    expectConflict(() => deleteAssembly(withObjects(), "chape"), "1 belt", "1 presence sensor");
  });
});
