import { describe, expect, it } from "vitest";
import { isScrolledToBottom } from "./console-scroll.ts";

describe("isScrolledToBottom", () => {
  it("is true at the end, and within a few pixels of it", () => {
    expect(isScrolledToBottom(300, 100, 400)).toBe(true);
    expect(isScrolledToBottom(297, 100, 400)).toBe(true);
  });

  it("is false once the user scrolled up to read", () => {
    expect(isScrolledToBottom(100, 100, 400)).toBe(false);
  });

  it("is true for a list that fits", () => {
    expect(isScrolledToBottom(0, 100, 60)).toBe(true);
  });
});
