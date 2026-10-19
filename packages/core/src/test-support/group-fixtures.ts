import { bodyEndpoint, groupEndpoint, type PantinDocument } from "@pantin/protocol";
import { guide } from "./conveyor-fixtures.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  joint,
} from "./placed-fixtures.ts";

// Documents for Grouper and Dégrouper (ADR 0055 points 6 and 7), with
// rotated placements so that a wrong frame shows.
//
// Grouping: "m" holds the handle "h" (nothing moves it), "a" fixed to it, "b"
// on a slider from it, and "c" unjointed. The sub-assembly "s" hangs from "h"
// by a slider, and the assembly "x" from "b".
//
// Dissolving: "g" is inside "m" and fixed to its handle "h"; it holds "ga",
// "gb" turning about the group, and "gc" on a slider from "ga". "x" hangs
// from "ga".

export const GROUPING_POSITIONS = new Map([
  ["sb", 0.3],
  ["ss", 0.1],
  ["bx", 0.2],
]);

export const DISSOLVING_POSITIONS = new Map([
  ["ring", 0.5],
  ["slide", 0.2],
  ["ex", 0.1],
]);

const SLIDE_X: {
  type: "prismatic";
  axis: [number, number, number];
  limits: [number, number];
} = { type: "prismatic", axis: [1, 0, 0], limits: [0, 1] };

export function groupingDocument(): PantinDocument {
  return documentOf(
    [
      joint({ id: "fa", type: "fixed", parent: bodyEndpoint("h"), child: bodyEndpoint("a") }),
      joint({
        id: "sb",
        ...SLIDE_X,
        origin: [0.1, 0, 0],
        parent: bodyEndpoint("h"),
        child: bodyEndpoint("b"),
      }),
      joint({ id: "ss", ...SLIDE_X, parent: bodyEndpoint("h"), child: groupEndpoint("s") }),
      joint({ id: "bx", ...SLIDE_X, parent: bodyEndpoint("b"), child: groupEndpoint("x") }),
    ],
    [
      body("h", "m"),
      body("a", "m", ABOUT_X),
      body("b", "m", ABOUT_DIAGONAL),
      body("c", "m"),
      body("s1", "s", ABOUT_Z),
      body("x1", "x"),
    ],
    [
      assembly("m", ABOUT_Z),
      { ...assembly("s", ABOUT_X), parent: "m" },
      assembly("x", ABOUT_DIAGONAL),
    ],
    {
      guides: [
        guide({ id: "on-a", assembly: "m", body: "a" }),
        guide({ id: "free", assembly: "m" }),
      ],
    },
  );
}

export function dissolvingDocument(): PantinDocument {
  return documentOf(
    [
      joint({ id: "hold", type: "fixed", parent: bodyEndpoint("h"), child: groupEndpoint("g") }),
      joint({
        id: "ring",
        parent: groupEndpoint("g"),
        child: bodyEndpoint("gb"),
        origin: [0.1, 0.2, 0.3],
      }),
      joint({
        id: "slide",
        ...SLIDE_X,
        origin: [0.3, 0.1, 0],
        parent: bodyEndpoint("ga"),
        child: bodyEndpoint("gc"),
      }),
      joint({ id: "ex", ...SLIDE_X, parent: bodyEndpoint("ga"), child: groupEndpoint("x") }),
    ],
    [
      body("h", "m"),
      body("ga", "g", ABOUT_Z),
      body("gb", "g"),
      body("gc", "g", ABOUT_DIAGONAL),
      body("x1", "x", ABOUT_X),
    ],
    [
      assembly("m", ABOUT_Z),
      { ...assembly("g", ABOUT_X), parent: "m" },
      assembly("x", ABOUT_DIAGONAL),
    ],
    {
      guides: [
        guide({ id: "on-ga", assembly: "g", body: "ga" }),
        guide({ id: "in-g", assembly: "g", placement: ABOUT_DIAGONAL }),
      ],
    },
  );
}
