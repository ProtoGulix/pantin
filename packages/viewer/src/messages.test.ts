import { describe, expect, it } from "vitest";
import { PantinApiError } from "./api-client.ts";
import { createTranslator } from "./i18n/translate.ts";
import { describeFailure } from "./messages.ts";

describe("describeFailure", () => {
  it("translates an API error from its code and keeps the core's message as detail", () => {
    const message = describeFailure(
      new PantinApiError("api", "No converter.", "conversion_unavailable", 503),
    );
    expect(message).toMatchObject({
      level: "error",
      key: "error.code.conversion_unavailable",
      detail: "No converter.",
    });
    expect(createTranslator("fr")(message.key)).toContain("--step-converter-python");
  });

  it("gives an actionable text for a failed STEP conversion", () => {
    const message = describeFailure(
      new PantinApiError("api", "No solid.", "conversion_failed", 422),
    );
    expect(createTranslator("en")(message.key)).toContain("GLB or STL");
    expect(message.detail).toBe("No solid.");
  });

  it.each([
    ["network", "error.network"],
    ["invalid_response", "error.invalidResponse"],
    ["invalid_input", "error.invalidInput"],
  ] as const)("maps a %s failure", (kind, key) => {
    expect(describeFailure(new PantinApiError(kind, "detail", null, null)).key).toBe(key);
  });

  it("never hides an unexpected error", () => {
    expect(describeFailure(new Error("boom"))).toMatchObject({
      key: "error.unexpected",
      detail: "boom",
    });
  });
});
