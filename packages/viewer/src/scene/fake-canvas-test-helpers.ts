import { vi } from "vitest";

// Babylon draws a label's letters on a canvas, which Node does not have. This
// stands in for OffscreenCanvas with a context whose every drawing call does
// nothing, enough to build the label meshes headless. Call before building one.
export function stubOffscreenCanvas(): void {
  const context = new Proxy(
    { measureText: () => ({ width: 10 }) },
    { get: (target, name) => Reflect.get(target, name) ?? (() => undefined) },
  );
  class FakeCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext(): unknown {
      return context;
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
}
