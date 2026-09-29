import { describe, expect, it } from "vitest";
import { EditSession, enterAction } from "./edit-session.ts";

describe("EditSession", () => {
  it("commits a changed value exactly once, even when Enter is followed by blur", () => {
    const session = new EditSession("Press");
    session.begin();
    expect(session.finish("Press 2")).toEqual({ type: "commit", value: "Press 2" });
    expect(session.finish("Press 2")).toEqual({ type: "none" });
  });

  it("cancels when the value did not really change", () => {
    const session = new EditSession("Press");
    session.begin();
    expect(session.finish("  Press ")).toEqual({ type: "cancel" });
  });

  it("ignores the blur that follows Escape", () => {
    const session = new EditSession("Press");
    session.begin();
    expect(session.abandon()).toEqual({ type: "cancel" });
    expect(session.finish("Pres")).toEqual({ type: "none" });
  });

  it("starts over when the field is focused again", () => {
    const session = new EditSession("Press");
    session.begin();
    session.finish("Press");
    session.begin();
    expect(session.finish("Robot")).toEqual({ type: "commit", value: "Robot" });
  });
});

describe("enterAction", () => {
  it("moves focus to the given target when blur commits, so focus stays in the tree", () => {
    expect(enterAction(true, true)).toBe("moveFocus");
  });

  it("just blurs when blur commits and no target is given (properties grid)", () => {
    expect(enterAction(true, false)).toBe("blur");
  });

  it("commits directly when leaving the field must not commit (creation form)", () => {
    expect(enterAction(false, true)).toBe("commitDirectly");
    expect(enterAction(false, false)).toBe("commitDirectly");
  });
});
