import { describe, expect, it } from "vitest";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { type KeyPress, shortcutForKeyPress } from "./menu-model.ts";

// The keys of the 3D view's shortcuts: Ctrl+1 to Ctrl+8 follow the physical key (AZERTY), the
// letters follow the character.

const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };
const onBody = withOpenPantin(listing, pantinResponse(true));

function press(key: string, overrides: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inEditableField: false,
    ...overrides,
  };
}

function commandOf(state: ViewerState, keyPress: KeyPress) {
  const found = shortcutForKeyPress(state, keyPress);
  return found?.run ? found.command : null;
}

describe("view shortcuts", () => {
  it("maps Ctrl+8 to Normal To and Ctrl+Shift+Z to the previous view, with a Pantin open", () => {
    expect(commandOf(onBody, press("8", { ctrlKey: true }))).toBe("normalTo");
    expect(commandOf(onBody, press("Z", { ctrlKey: true, shiftKey: true }))).toBe("previousView");
    expect(commandOf(onBody, press("z", { ctrlKey: true }))).toBeNull();
    expect(commandOf(listing, press("8", { ctrlKey: true }))).toBeNull();
  });

  it("leaves Ctrl+Shift+Z to a text field, which redoes its text with it", () => {
    const inField = shortcutForKeyPress(
      onBody,
      press("Z", { ctrlKey: true, shiftKey: true, inEditableField: true }),
    );
    expect(inField).toMatchObject({ run: false, yieldsToField: true });
    const outside = shortcutForKeyPress(onBody, press("Z", { ctrlKey: true, shiftKey: true }));
    expect(outside).toMatchObject({ run: true, yieldsToField: false });
  });

  it('reads digit shortcuts from the physical key, as AZERTY gives "_" for Ctrl+8', () => {
    expect(commandOf(onBody, press("_", { ctrlKey: true, code: "Digit8" }))).toBe("normalTo");
    expect(commandOf(onBody, press("&", { ctrlKey: true, code: "Digit1" }))).toBe("view:front");
    expect(commandOf(onBody, press("8", { ctrlKey: true, code: "Numpad8" }))).toBe("normalTo");
    expect(commandOf(onBody, press("8", { ctrlKey: true, code: "Digit7" }))).toBe("view:isometric");
  });

  it("keeps letters on the character, whatever the physical key", () => {
    expect(commandOf(onBody, press("z", { ctrlKey: true, shiftKey: true, code: "KeyW" }))).toBe(
      "previousView",
    );
  });
});
