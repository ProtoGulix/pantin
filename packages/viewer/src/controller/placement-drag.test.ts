import type { Placement } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { nodeSelection } from "../selection.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { assemblyNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { dragPlacement, finishPlacementDrag } from "./placement-actions.ts";

// A dragged gizmo sends placements one at a time, the latest replacing the one
// waiting (ADR 0034 point 4), and reads the Pantin once when it is over.

const pantin = pantinResponse(false);
const answer = {
  placement: pantin.document.assemblies[0]?.placement,
  anchor: { kind: "world" as const },
};

function dragStore(release: () => void = () => undefined) {
  const finishers: (() => void)[] = [];
  const sent: Placement[] = [];
  const getPantin = vi.fn(async () => pantin);
  const store = testStore(
    {
      getPantin,
      listPantins: async () => [],
      setAssemblyPlacement: (_pantinId, _key, placement) => {
        sent.push(placement);
        return new Promise((resolve) => {
          finishers.push(() => resolve(answer as never));
        });
      },
    },
    { releasePlacementGizmo: release },
  );
  store.requestedPantinId = pantin.id;
  store.state = withSelection(
    withOpenPantin(store.state, pantin),
    nodeSelection(assemblyNodeId("press", "main")),
  );
  return { store, sent, finishers, getPantin };
}

const at = (x: number) => ({ translation: [x, 0, 0] as const, rotation: [0, 0, 0, 1] as const });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("dragging a placement", () => {
  it("keeps one request in flight and sends the latest value after it", async () => {
    const { store, sent, finishers } = dragStore();
    dragPlacement(store, "main", at(0.001));
    dragPlacement(store, "main", at(0.002));
    dragPlacement(store, "main", at(0.003));
    expect(sent.map((placement) => placement.translation[0])).toEqual([0.001]);
    finishers[0]?.();
    await flush();
    expect(sent.map((placement) => placement.translation[0])).toEqual([0.001, 0.003]);
  });

  it("reads the Pantin once, after the last request, then frees the gizmo", async () => {
    const release = vi.fn();
    const { store, finishers, getPantin } = dragStore(release);
    dragPlacement(store, "main", at(0.001));
    dragPlacement(store, "main", at(0.002));
    const finished = finishPlacementDrag(store);
    await flush();
    expect(getPantin).not.toHaveBeenCalled();
    finishers[0]?.();
    await flush();
    finishers[1]?.();
    await finished;
    expect(getPantin).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("sends the placement of the start for Escape as the latest value", async () => {
    const { store, sent, finishers } = dragStore();
    dragPlacement(store, "main", at(0.001));
    dragPlacement(store, "main", at(0.05));
    // The gizmo reports Escape as one more value: the one of the drag's start.
    dragPlacement(store, "main", at(0));
    finishers[0]?.();
    await flush();
    expect(sent.at(-1)?.translation).toEqual([0, 0, 0]);
  });
});

describe("the fields during a drag", () => {
  it("shows the last placement sent in display units during the drag, the document after", async () => {
    const { store, finishers } = dragStore();
    dragPlacement(store, "main", at(0.001));
    dragPlacement(store, "main", at(0.0025));
    expect(store.state.placementDraft).toMatchObject({
      pantinId: "press",
      key: "main",
      fields: { x: 2.5, y: 0, z: 0 },
    });
    const finished = finishPlacementDrag(store);
    await flush();
    finishers[0]?.();
    await flush();
    finishers[1]?.();
    await finished;
    expect(store.state.placementDraft).toBeNull();
  });
});

describe("two drags in a row", () => {
  it("lets the end of the first leave the draft of the second", async () => {
    const { store, finishers } = dragStore();
    dragPlacement(store, "main", at(0.001));
    const finished = finishPlacementDrag(store);
    dragPlacement(store, "main", at(0.004));
    await flush();
    finishers[0]?.();
    await flush();
    finishers[1]?.();
    await finished;
    expect(store.state.placementDraft?.fields.x).toBe(4);
  });
});

describe("freeing the gizmo", () => {
  it("frees the gizmo even when no Pantin is open", async () => {
    const release = vi.fn();
    const store = testStore({}, { releasePlacementGizmo: release });
    await finishPlacementDrag(store);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
