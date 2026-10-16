import { describe, expect, it } from "vitest";
import { showReleaseAll } from "./transport-bar.ts";

// The "Relâcher tout" button of the transport bar is shown only while a tag is forced.

function parts() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    button: {
      hidden: false as boolean | string,
      title: "",
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
    label: { textContent: "" as string | null },
  };
}

describe("showReleaseAll", () => {
  it("hides the button when nothing is forced", () => {
    const shown = parts();
    showReleaseAll(shown, null);
    expect(shown.button.hidden).toBe(true);
  });

  it("shows the count, the accessible name and the hint when tags are forced", () => {
    const shown = parts();
    showReleaseAll(shown, { label: "Relâcher tout (2)", hint: "L'automate est ignoré" });
    expect(shown.button.hidden).toBe(false);
    expect(shown.label.textContent).toBe("Relâcher tout (2)");
    expect(shown.attributes.get("aria-label")).toBe("Relâcher tout (2)");
    expect(shown.button.title).toBe("L'automate est ignoré");
  });
});
