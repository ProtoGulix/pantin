import { describe, expect, it } from "vitest";
import { unhandledKeyInDiagram } from "./diagram-key-policy.ts";

const press = (key: string, modifiers: object = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  inEditableField: false,
  ...modifiers,
});

describe("unhandledKeyInDiagram", () => {
  it("answers Delete with the hint, so it never reaches the window shortcut", () => {
    // The scroll host, a remove button and a menu item all end here.
    expect(unhandledKeyInDiagram(press("Delete"))).toBe("hint");
  });

  it("swallows F2 where the diagram did not rename a device", () => {
    expect(unhandledKeyInDiagram(press("F2"))).toBe("swallow");
  });

  it("lets other keys and modified keys through", () => {
    expect(unhandledKeyInDiagram(press("Tab"))).toBe("pass");
    expect(unhandledKeyInDiagram(press("Delete", { ctrlKey: true }))).toBe("pass");
    expect(unhandledKeyInDiagram(press("F2", { altKey: true }))).toBe("pass");
  });

  it("leaves Delete and F2 to a text field inside the diagram", () => {
    expect(unhandledKeyInDiagram(press("Delete", { inEditableField: true }))).toBe("pass");
    expect(unhandledKeyInDiagram(press("F2", { inEditableField: true }))).toBe("pass");
  });
});
