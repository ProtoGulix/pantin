import { describe, expect, it } from "vitest";
import { assemblyNodeId, bodyNodeId, jointNodeId, pantinNodeId } from "./node-ids.ts";
import { rowClickSelection, siblingRowId } from "./row-selection.ts";
import type { TreeRow } from "./tree-rows.ts";

// Multi-selection rules (ADR 0055 point 12), on hand-made visible rows:
// Pantin > frame (top-level assembly) > [rod, head, cap (group) > cap_body],
// and a second top-level assembly.

const CTRL = { toggle: true, range: false };
const SHIFT = { toggle: false, range: true };

function row(id: string, kind: TreeRow["kind"], parentId: string | null, depth: number): TreeRow {
  // Only the fields the selection rules read; the rest of a row is display.
  return { id, kind, parentId, depth, selected: false, active: false } as TreeRow;
}

const pantin = pantinNodeId("p");
const frame = assemblyNodeId("p", "frame");
const rod = bodyNodeId("p", "rod");
const head = bodyNodeId("p", "head");
const cap = assemblyNodeId("p", "cap");
const capBody = bodyNodeId("p", "cap_body");
const other = assemblyNodeId("p", "other");

// The rows with `selected` selected, the first one being the active row.
function rowsWith(selected: string[]): TreeRow[] {
  const all = [
    row(pantin, "pantin", null, 0),
    row(frame, "assembly", pantin, 1),
    row(rod, "body", frame, 2),
    row(head, "body", frame, 2),
    row(cap, "assembly", frame, 2),
    row(capBody, "body", cap, 3),
    row(other, "assembly", pantin, 1),
  ];
  return all.map((candidate) => ({
    ...candidate,
    selected: selected.includes(candidate.id),
    active: selected[0] === candidate.id,
  }));
}

describe("rowClickSelection", () => {
  it("is a plain click without a modifier or without a selection", () => {
    expect(rowClickSelection(rowsWith([rod]), head, { toggle: false, range: false })).toBeNull();
    expect(rowClickSelection(rowsWith([]), head, CTRL)).toBeNull();
  });

  it("adds and removes rows with Ctrl, never emptying the selection", () => {
    expect(rowClickSelection(rowsWith([rod]), head, CTRL)).toEqual([rod, head]);
    expect(rowClickSelection(rowsWith([rod, head]), rod, CTRL)).toEqual([head]);
    expect(rowClickSelection(rowsWith([rod]), rod, CTRL)).toEqual([rod]);
  });

  it("takes a group row under the same assembly as a body row", () => {
    expect(rowClickSelection(rowsWith([rod]), cap, CTRL)).toEqual([rod, cap]);
  });

  it("selects the siblings between the first selected row and the click with Shift", () => {
    expect(rowClickSelection(rowsWith([rod]), cap, SHIFT)).toEqual([rod, head, cap]);
    expect(rowClickSelection(rowsWith([cap]), rod, SHIFT)).toEqual([cap, rod, head]);
  });

  it("refuses rows of other assemblies, top-level assemblies and other kinds", () => {
    expect(rowClickSelection(rowsWith([rod]), capBody, CTRL)).toBeNull();
    expect(rowClickSelection(rowsWith([frame]), other, CTRL)).toBeNull();
    expect(rowClickSelection(rowsWith([rod]), frame, SHIFT)).toBeNull();
    expect(rowClickSelection(rowsWith([pantin]), rod, CTRL)).toBeNull();
  });
});

describe("siblingRowId", () => {
  it("moves the end away from the first selected row, skipping unfolded children", () => {
    expect(siblingRowId(rowsWith([rod]), 1)).toBe(head);
    expect(siblingRowId(rowsWith([rod, head, cap]), 1)).toBeNull();
    expect(siblingRowId(rowsWith([cap, head]), -1)).toBe(rod);
    expect(siblingRowId(rowsWith([head]), -1)).toBe(rod);
  });

  it("steps over joint rows between the siblings", () => {
    const jointOne = jointNodeId("p", "j1");
    const jointTwo = jointNodeId("p", "j2");
    const [first, second, third, fourth, fifth, sixth, seventh] = rowsWith([]);
    const withJoints = [
      first,
      second,
      third,
      row(jointOne, "joint", frame, 2),
      fourth,
      row(jointTwo, "joint", frame, 2),
      fifth,
      sixth,
      seventh,
    ] as TreeRow[];
    const selecting = (id: string) =>
      withJoints.map((candidate) => ({
        ...candidate,
        selected: candidate.id === id,
        active: candidate.id === id,
      }));
    expect(siblingRowId(selecting(rod), 1)).toBe(head);
    expect(siblingRowId(selecting(head), 1)).toBe(cap);
    expect(siblingRowId(selecting(cap), -1)).toBe(head);
  });

  it("has nowhere to go with nothing selected", () => {
    expect(siblingRowId(rowsWith([]), 1)).toBeNull();
  });
});
