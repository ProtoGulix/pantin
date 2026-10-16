import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { applyForcedMarks } from "./diagram-live-apply.ts";

// The sockets of forced command tags: a class and a word in the accessible name.

function fakePort(tagName: string | null, label: string) {
  const classes = new Set<string>();
  const attributes = new Map([["aria-label", label]]);
  return {
    tagName,
    classes,
    attributes,
    group: {
      classList: {
        toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
      },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  };
}

const t = createTranslator("fr");

describe("applyForcedMarks", () => {
  it("marks a socket when its tag becomes forced, and unmarks it once released", () => {
    const coil = fakePort("a.v.coil_14", "Bobine 14");
    const drawn = { nodes: new Map([["drive:v", { sockets: new Map([["tag:coil_14", coil]]) }]]) };
    applyForcedMarks(drawn, t, new Set(), new Set(["a.v.coil_14"]));
    expect(coil.classes.has("is-forced")).toBe(true);
    expect(coil.attributes.get("aria-label")).toBe("Bobine 14, forcé");
    applyForcedMarks(drawn, t, new Set(["a.v.coil_14"]), new Set());
    expect(coil.classes.has("is-forced")).toBe(false);
    expect(coil.attributes.get("aria-label")).toBe("Bobine 14");
  });

  it("leaves the other sockets and the unchanged ones alone", () => {
    const other = fakePort("a.v.coil_12", "Bobine 12");
    const port = fakePort(null, "Orifice 2");
    const drawn = {
      nodes: new Map([
        [
          "n",
          {
            sockets: new Map([
              ["a", other],
              ["b", port],
            ]),
          },
        ],
      ]),
    };
    applyForcedMarks(drawn, t, new Set(["a.v.coil_12"]), new Set(["a.v.coil_12"]));
    expect([other.classes.size, port.classes.size]).toEqual([0, 0]);
    expect(other.attributes.get("aria-label")).toBe("Bobine 12");
  });
});
