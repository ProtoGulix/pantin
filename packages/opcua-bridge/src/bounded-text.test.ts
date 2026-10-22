import { describe, expect, it } from "vitest";
import { boundedPlcText, MAX_PLC_TEXT_CHARACTERS } from "./bounded-text.ts";

describe("boundedPlcText", () => {
  it("keeps a short text as it is", () => {
    expect(boundedPlcText("CN=Pantin")).toBe("CN=Pantin");
  });

  it("cuts a long text to the limit, with a marker, counting characters not bytes", () => {
    const cut = boundedPlcText("😀".repeat(1000));

    expect([...cut]).toHaveLength(MAX_PLC_TEXT_CHARACTERS);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});
