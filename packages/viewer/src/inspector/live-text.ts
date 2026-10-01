import type { DriveRuntime } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { diagnosticLines } from "../panel/drive-diagnostics.ts";
import type { LiveSource } from "../properties/property-rows.ts";
import { coordinateToDisplay, formatDisplayNumber } from "../units.ts";

// The text a live cell shows (ADR 0030), from the latest tag read. Pure, so
// that every rule is tested without a page; the page only writes the result.

const LIT = 0.5;

function isLit(value: number | undefined): boolean {
  return value !== undefined && value >= LIT;
}

/** A value in display units (mm, degrees), or as it arrives when it has none. */
function numberText(value: number, unit: Extract<LiveSource, { kind: "tag" }>["unit"]): string {
  return formatDisplayNumber(coordinateToDisplay(unit, value));
}

function driveStatus(
  source: Extract<LiveSource, { kind: "driveStatus" }>,
  tags: ReadonlyMap<string, number>,
  runtime: ReadonlyMap<string, DriveRuntime>,
  t: Translate,
): string {
  const warnings = diagnosticLines(
    runtime.get(source.driveId)?.diagnostics ?? [],
    source.driveType,
    t,
  );
  if (warnings.length > 0) {
    return warnings.map((line) => line.text).join(" ");
  }
  return source.commands
    .filter((command) => isLit(tags.get(command.tag)))
    .map((command) => command.label)
    .join(", ");
}

/**
 * The text of a live cell, or null when the core has not reported its tag yet
 * (the cell keeps what it shows). A diagnostics cell has lines, not a text:
 * the page asks diagnosticLines for them.
 */
export function liveText(
  source: LiveSource,
  tags: ReadonlyMap<string, number>,
  runtime: ReadonlyMap<string, DriveRuntime>,
  t: Translate,
): string | null {
  switch (source.kind) {
    case "tag": {
      const value = tags.get(source.tag);
      if (value === undefined) {
        return null;
      }
      return source.format === "bit"
        ? t(isLit(value) ? "drives.bit.on" : "drives.bit.off")
        : numberText(value, source.unit);
    }
    case "driveStatus":
      return driveStatus(source, tags, runtime, t);
    case "diagnostics":
      return null;
  }
}
