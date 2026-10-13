import { describe, expect, it } from "vitest";
import { railBody } from "../test-fixtures.ts";
import {
  beamCell,
  cartonSource,
  conveyorPantin,
  exitSink,
  feedBelt,
  sideGuide,
} from "./conveyor-fixtures.ts";
import {
  bodiesOfAssembly,
  type ConveyorFormState,
  conveyorFormOf,
  initialConveyorForm,
  parsePresenceType,
  withConveyorFormAssembly,
  withConveyorFormField,
  withConveyorFormType,
} from "./conveyor-form.ts";
import type { ConveyorKind } from "./conveyor-kinds.ts";
import { buildConveyorRequest, type ConveyorRequest } from "./conveyor-request.ts";

// The form of a phase 6 object (ADR 0043 point 13): millimetres, degrees,
// kilograms and milliseconds typed, SI sent.

const { document } = conveyorPantin();

function storedForm(kind: ConveyorKind, id: string): ConveyorFormState {
  const form = conveyorFormOf(document, kind, id);
  if (form === null) {
    throw new Error(`The fixture has no ${kind} "${id}".`);
  }
  return form;
}

function named(form: ConveyorFormState, name: string): ConveyorFormState {
  return withConveyorFormField(form, "name", name);
}

function requestOf(form: ConveyorFormState): ConveyorRequest {
  const built = buildConveyorRequest(form);
  if (!built.ok) {
    throw new Error(built.message);
  }
  return built.request;
}

describe("a new object's defaults", () => {
  it("starts with plausible sizes, the first assembly and the first continuous joint", () => {
    const belt = initialConveyorForm("belt", document);
    expect([belt.assembly, belt.body, belt.values.drumJoint, belt.values.length]).toEqual([
      "main",
      "",
      "spin",
      "1000",
    ]);
    expect(initialConveyorForm("emitter", document).values.material).toBe("cardboard");
    expect(initialConveyorForm("presenceSensor", document).values).toMatchObject({
      mode: "diffuse",
      range: "300",
      normallyClosed: "false",
    });
  });
});

describe("the request of a new object", () => {
  it("is in metres, with the placement as a unit quaternion", () => {
    const form = named(initialConveyorForm("belt", document), "Feed");
    const request = requestOf(withConveyorFormField(form, "rz", "90"));
    if (request.kind !== "belt") {
      throw new Error("A belt form builds a belt request.");
    }
    expect(request.request).toMatchObject({
      name: "Feed",
      assembly: "main",
      length: 1,
      width: 0.3,
      drumRadius: 0.05,
      drumJoint: "spin",
    });
    const [x, y, z, w] = request.request.placement.rotation;
    expect([x, y]).toEqual([0, 0]);
    expect([z, w]).toEqual([expect.closeTo(Math.SQRT1_2, 9), expect.closeTo(Math.SQRT1_2, 9)]);
  });

  it("sends the box of an emitter with its mass in kilograms and its size in metres", () => {
    const form = named(initialConveyorForm("emitter", document), "Source");
    const request = requestOf(withConveyorFormField(form, "mass", "2,5"));
    expect(request.kind === "emitter" && request.request.box).toEqual({
      size: [0.2, 0.15, 0.1],
      mass: 2.5,
      material: "cardboard",
    });
  });

  it("sends a cell's range in metres and its delays in seconds", () => {
    let form = named(initialConveyorForm("presenceSensor", document), "Cell");
    form = withConveyorFormField(withConveyorFormField(form, "range", "600"), "offDelay", "50");
    expect(requestOf(form).request).toMatchObject({
      type: "photoelectric",
      mode: "diffuse",
      range: 0.6,
      onDelay: 0,
      offDelay: 0.05,
      normallyClosed: false,
    });
  });

  it("leaves the body out when none is chosen, and sends it when one is", () => {
    const form = named(initialConveyorForm("guide", document), "Side");
    expect("body" in requestOf(form).request).toBe(false);
    expect(requestOf({ ...form, body: "rail" }).request).toMatchObject({ body: "rail" });
  });
});

describe("the schema's refusals", () => {
  it("names a size that is zero and refuses one that is not a number", () => {
    const form = named(initialConveyorForm("absorber", document), "Sink");
    const zero = buildConveyorRequest(withConveyorFormField(form, "sizeY", "0"));
    expect(!zero.ok && zero.message).toMatch(/greater than zero/);
    expect(buildConveyorRequest(withConveyorFormField(form, "sizeX", "wide")).ok).toBe(false);
  });

  it("refuses a belt with no drum joint, an empty name and a placement that is not a number", () => {
    const belt = named(initialConveyorForm("belt", document), "Feed");
    expect(buildConveyorRequest(withConveyorFormField(belt, "drumJoint", "")).ok).toBe(false);
    expect(buildConveyorRequest(initialConveyorForm("guide", document)).ok).toBe(false);
    expect(buildConveyorRequest(withConveyorFormField(belt, "x", "left")).ok).toBe(false);
  });
});

describe("a stored object's form", () => {
  it("shows every value in millimetres, degrees, kilograms and milliseconds", () => {
    expect(storedForm("belt", "feed").values).toMatchObject({
      x: "100",
      y: "200",
      z: "500",
      rx: "0",
      length: "1000",
      width: "300",
      drumRadius: "50",
      drumJoint: "spin",
    });
    expect(storedForm("emitter", "source")).toMatchObject({
      body: "rail",
      values: { sizeX: "200", mass: "0.5", material: "cardboard" },
    });
    expect(storedForm("presenceSensor", "cell").values).toMatchObject({
      mode: "diffuse",
      range: "300",
      offDelay: "50",
      normallyClosed: "false",
    });
  });

  it("gives back the object it was built from when nothing is retyped", () => {
    const cases = [
      ["belt", feedBelt],
      ["guide", sideGuide],
      ["emitter", cartonSource],
      ["absorber", exitSink],
      ["presenceSensor", beamCell],
    ] as const;
    for (const [kind, stored] of cases) {
      expect(requestOf(storedForm(kind, stored.id)).request).toMatchObject({
        name: stored.name,
        assembly: stored.assembly,
      });
    }
  });

  it("has no form for an object the document does not hold", () => {
    expect(conveyorFormOf(document, "guide", "ghost")).toBeNull();
  });
});

describe("the body picker and the type", () => {
  const twoAssemblies = {
    ...document,
    assemblies: [
      ...document.assemblies,
      { key: "other", name: "Other", placement: feedBelt.placement },
    ],
    bodies: [...document.bodies, { ...railBody, id: "side_body", assembly: "other" }],
  };

  it("offers the bodies of the assembly only", () => {
    expect(bodiesOfAssembly(twoAssemblies, "other").map((body) => body.id)).toEqual(["side_body"]);
    expect(bodiesOfAssembly(twoAssemblies, "main").map((body) => body.id)).toEqual([
      "rail",
      "carriage",
    ]);
  });

  it("drops the body when another assembly is chosen, and keeps one that belongs to it", () => {
    const form = { ...initialConveyorForm("guide", twoAssemblies), body: "rail" };
    expect(withConveyorFormAssembly(form, "other", twoAssemblies).body).toBe("");
    expect(withConveyorFormAssembly(form, "main", twoAssemblies).body).toBe("rail");
  });

  it("keeps the placement of a cell whose type changes", () => {
    const form = withConveyorFormField(initialConveyorForm("presenceSensor", document), "x", "40");
    expect(withConveyorFormType(form, "photoelectric").values.x).toBe("40");
    expect(parsePresenceType("photoelectric")).toBe("photoelectric");
    expect(parsePresenceType("inductive")).toBeNull();
  });
});
