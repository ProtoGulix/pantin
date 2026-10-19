import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "./diagram/diagram-fixtures.ts";
import { rigidBodyIds } from "./rigid-sets.ts";

const sorted = (ids: ReadonlySet<string>) => [...ids].sort();

const document = documentOf({
  assemblies: ["carriage", "motor", "arm"],
  bodies: [
    bodyOf("plate", "carriage"),
    bodyOf("motor", "carriage"),
    bodyOf("screw", "carriage"),
    bodyOf("cover", "motor"),
    bodyOf("hand", "arm"),
    bodyOf("finger", "arm"),
  ],
  joints: [
    // "screw" turns inside the carriage: it does not move with it.
    { ...jointOf("spin", "screw", "continuous"), parent: groupEndpoint("carriage") },
    // The motor group is bolted to the plate, the arm swings from the motor.
    {
      ...jointOf("bolt", "x", "fixed"),
      parent: bodyEndpoint("plate"),
      child: groupEndpoint("motor"),
    },
    {
      ...jointOf("swing", "x", "revolute"),
      parent: bodyEndpoint("cover"),
      child: groupEndpoint("arm"),
    },
    { ...jointOf("grip", "finger", "prismatic"), parent: bodyEndpoint("hand") },
  ],
});

describe("rigidBodyIds", () => {
  it("gives a group its unmoved bodies and the sub-assemblies held by fixed joints", () => {
    expect(sorted(rigidBodyIds(document, groupEndpoint("carriage")))).toEqual([
      "cover",
      "frame", // added by the fixture, in the first assembly
      "motor",
      "plate",
    ]);
  });

  it("leaves out what a moving joint carries, inside or below the group", () => {
    const ids = rigidBodyIds(document, groupEndpoint("carriage"));
    expect(ids.has("screw")).toBe(false);
    expect(ids.has("hand")).toBe(false);
  });

  it("climbs a body end to its fixed holder and its group, then walks down again", () => {
    const chain = documentOf({
      assemblies: ["a", "b"],
      bodies: [bodyOf("one", "a"), bodyOf("two", "a"), bodyOf("three", "a"), bodyOf("far", "b")],
      joints: [
        { ...jointOf("j1", "two", "fixed"), parent: bodyEndpoint("one") },
        { ...jointOf("j2", "three", "fixed"), parent: bodyEndpoint("two") },
        {
          ...jointOf("j3", "far", "fixed"),
          parent: bodyEndpoint("three"),
          child: groupEndpoint("b"),
        },
      ],
    });
    expect(sorted(rigidBodyIds(chain, bodyEndpoint("two")))).toEqual([
      "far",
      "frame",
      "one",
      "three",
      "two",
    ]);
  });

  it("takes the group-mates of an unjointed body end, not what moves inside", () => {
    expect(sorted(rigidBodyIds(document, bodyEndpoint("plate")))).toEqual([
      "cover",
      "frame",
      "motor",
      "plate",
    ]);
    expect(sorted(rigidBodyIds(document, bodyEndpoint("screw")))).toEqual(["screw"]);
  });

  it("climbs through the fixed joint of a sub-assembly to the holder's group", () => {
    expect(sorted(rigidBodyIds(document, groupEndpoint("motor")))).toContain("plate");
  });

  it("keeps a lone body and an empty group small", () => {
    expect(sorted(rigidBodyIds(document, bodyEndpoint("hand")))).toEqual(["hand"]);
    expect(sorted(rigidBodyIds(document, groupEndpoint("nowhere")))).toEqual([]);
  });
});
