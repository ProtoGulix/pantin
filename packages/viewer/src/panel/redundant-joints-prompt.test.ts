import type { RedundantJointsList } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { redundantJointsSections, redundantJointsText } from "./redundant-joints-prompt.ts";

// The wording of the redundant fixed joints prompt (ADR 0060 point 5).

const frame = { key: "frame", name: "Frame" };
const arm = { key: "arm", name: "Arm" };
const star = (id: string, assembly = frame) => ({ id, name: id.toUpperCase(), assembly });

const list: RedundantJointsList = {
  redundant: [star("a1", arm), star("a2", arm), star("f1")],
  kept: [
    {
      ...star("k1"),
      reason: "moving_parent",
      by: { kind: "joint", id: "slide", name: "Slide" },
    },
    {
      ...star("k2"),
      reason: "in_use",
      by: { kind: "actuator", id: "cyl", name: "Cylinder" },
    },
  ],
};

describe.each(["fr", "en"] as const)("in %s", (language) => {
  const t = createTranslator(language);

  it("counts the redundant joints in the question", () => {
    expect(redundantJointsText(list, language, t)).toContain("3");
  });

  it("puts a count in each heading", () => {
    const headings = redundantJointsSections(list, t).map(({ heading }) => heading);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toContain("(3)");
    expect(headings[1]).toContain("(2)");
  });
});

describe("in French", () => {
  const t = createTranslator("fr");

  it("words the question with the plural of the count", () => {
    expect(redundantJointsText(list, "fr", t)).toBe(
      "Supprimer 3 liaisons fixes redondantes ? Les corps suivent déjà leur groupe : rien ne bouge.",
    );
    const single = { redundant: [star("a1")], kept: [] };
    expect(redundantJointsText(single, "fr", t)).toBe(
      "Supprimer 1 liaison fixe redondante ? Le corps suit déjà son groupe : rien ne bouge.",
    );
  });

  it("groups the joints to delete by assembly and gives one reason line per kept joint", () => {
    const [toDelete, kept] = redundantJointsSections(list, t);
    expect(toDelete).toEqual({
      heading: "À supprimer (3)",
      lines: ["Arm : A1, A2", "Frame : F1"],
    });
    expect(kept).toEqual({
      heading: "Conservées (2)",
      lines: ["K1 : son parent bouge avec « Slide »", "K2 : utilisée par « Cylinder »"],
    });
  });

  it("has no kept section when the core kept nothing", () => {
    const sections = redundantJointsSections({ redundant: list.redundant, kept: [] }, t);
    expect(sections.map(({ heading }) => heading)).toEqual(["À supprimer (3)"]);
  });
});

describe("assemblies sharing a name", () => {
  it("are listed apart, each under its own key", () => {
    const t = createTranslator("en");
    const first = { key: "arm-1", name: "Arm" };
    const second = { key: "arm-2", name: "Arm" };
    const twins: RedundantJointsList = {
      redundant: [star("a", first), star("b", second), star("c", first)],
      kept: [],
    };
    const lines = redundantJointsSections(twins, t)[0]?.lines ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("A, C");
    expect(lines[1]).toContain("B");
  });
});
