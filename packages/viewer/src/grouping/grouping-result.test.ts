import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { createTranslator } from "../i18n/translate.ts";
import { groupingFailureMessage, groupingResultMessage } from "./grouping-result.ts";

const fr = createTranslator("fr");
const en = createTranslator("en");

describe("groupingResultMessage", () => {
  it("says only what was done when nothing else changed", () => {
    const message = groupingResultMessage(
      "group",
      { name: "Tige", deletedJoints: [], renamedTags: [] },
      "fr",
    );
    expect(fr(message.key, message.parameters)).toBe("Groupe « Tige » créé.");
    expect(message.detail).toBeNull();
  });

  it("lists the deleted joints and asks to regenerate the GVL when tags were renamed", () => {
    const result = {
      name: "Rod",
      deletedJoints: [
        { id: "a", name: "Weld A" },
        { id: "b", name: "Weld B" },
      ],
      renamedTags: [{ from: "frame.x.cmd", to: "rod.x.cmd" }],
    };
    const message = groupingResultMessage("ungroup", result, "en");
    expect(en(message.key, message.parameters)).toBe(
      'Group "Rod" dissolved. Joints deleted: Weld A, Weld B. Tags were renamed: regenerate the PLC\'s GVL.',
    );
    expect(message.detail).toBe("frame.x.cmd → rod.x.cmd");
  });
});

describe("groupingFailureMessage", () => {
  it("shows the core's refusal as it is", () => {
    const refusal = new PantinApiError("api", 'Joint "Slide" moves "Rod".', "conflict", 409);
    const message = groupingFailureMessage(refusal);
    expect(fr(message.key, message.parameters)).toBe('Joint "Slide" moves "Rod".');
    expect(message.level).toBe("error");
  });

  it("keeps the usual message for a network failure", () => {
    const message = groupingFailureMessage(new PantinApiError("network", "down", null, null));
    expect(message.key).toBe("error.network");
  });
});
