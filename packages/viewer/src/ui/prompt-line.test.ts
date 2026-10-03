import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromptView } from "../panel/prompt-model.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPromptLine } from "./prompt-line.ts";

// The viewer's tests run without a DOM: a minimal stand-in records the tree.

class FakeNode {
  className = "";
  textContent = "";
  disabled = false;
  id = "";
  readonly children: FakeNode[] = [];
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  append(child: FakeNode): void {
    this.children.push(child);
  }
  setAttribute(): void {}
  addEventListener(): void {}
  find(tag: string): FakeNode[] {
    return this.children.flatMap((child) => [
      ...(child.tag === tag ? [child] : []),
      ...child.find(tag),
    ]);
  }
}

afterEach(() => vi.unstubAllGlobals());

function render(prompt: PromptView): FakeNode {
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeNode(tag),
    createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
  });
  return renderPromptLine(prompt, {} as PanelIntents) as unknown as FakeNode;
}

const actions = [{ action: "cancelDelete" as const, label: "Annuler", primary: false }];

describe("renderPromptLine details", () => {
  it("renders each detail as a list item under the question", () => {
    const line = render({
      text: "Supprimer ?",
      details: ["Corps (1) : Doigt", "Capteurs (1) : Fin"],
      enabled: true,
      actions,
    });
    expect(line.find("li").map((item) => item.textContent)).toEqual([
      "Corps (1) : Doigt",
      "Capteurs (1) : Fin",
    ]);
    expect(line.find("ul")[0]?.className).toBe("prompt-line__details");
  });

  it("renders no list without details", () => {
    expect(render({ text: "Supprimer ?", enabled: true, actions }).find("ul")).toEqual([]);
  });
});
