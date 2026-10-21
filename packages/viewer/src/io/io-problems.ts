import type { IoPath, IoProblem } from "@pantin/protocol";

// Where a problem shows (ADR 0049 point 11): the core reports a JSON path into
// io.json, the view finds the cell from it. Pure, so the lookup is unit tested.

export interface IoCellRef {
  moduleIndex: number;
  // Null for a module setting.
  channelIndex: number | null;
  field: string;
}

// The settings of a module are under `transport`, the transport fields of a channel under the
// sub-object named after the transport (ADR 0064 point 4): the cell is named by the last part.
const TRANSPORT_SECTIONS: ReadonlySet<PathPart> = new Set(["modbus"]);
type PathPart = IoPath[number];

/** The cell a path points at, or null for the whole file or a whole module or channel. */
export function cellOfPath(path: IoPath): IoCellRef | null {
  const [root, moduleIndex, section, third, fourth, fifth] = path;
  if (root !== "modules" || typeof moduleIndex !== "number") {
    return null;
  }
  if (section === "transport" && typeof third === "string") {
    return { moduleIndex, channelIndex: null, field: third };
  }
  if (typeof section === "string" && section !== "channels" && section !== "transport") {
    return { moduleIndex, channelIndex: null, field: section };
  }
  if (section === "channels" && typeof third === "number") {
    const field = TRANSPORT_SECTIONS.has(fourth ?? "") ? fifth : fourth;
    return typeof field === "string" ? { moduleIndex, channelIndex: third, field } : null;
  }
  return null;
}

export function cellIdOf(cell: IoCellRef): string {
  const channel = cell.channelIndex === null ? "" : `-${cell.channelIndex}`;
  return `io-cell-${cell.moduleIndex}${channel}-${cell.field}`;
}

/** The module a path belongs to, or null for the whole file. */
export function moduleIndexOfPath(path: IoPath): number | null {
  const [root, moduleIndex] = path;
  return root === "modules" && typeof moduleIndex === "number" ? moduleIndex : null;
}

export function problemCountByModule(problems: readonly IoProblem[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const problem of problems) {
    const index = moduleIndexOfPath(problem.path);
    if (index !== null) {
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }
  return counts;
}

/** The messages of the problems on each cell, by cell id. */
export function problemMessagesByCell(
  problems: readonly IoProblem[],
): ReadonlyMap<string, readonly string[]> {
  const byCell = new Map<string, string[]>();
  for (const problem of problems) {
    const cell = cellOfPath(problem.path);
    if (cell !== null) {
      const id = cellIdOf(cell);
      byCell.set(id, [...(byCell.get(id) ?? []), problem.message]);
    }
  }
  return byCell;
}
