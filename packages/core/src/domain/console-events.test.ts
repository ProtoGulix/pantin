import type { DriveDiagnostic } from "@pantin/drive-types/schemas";
import { ConsoleEventSchema, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { diagnosticEvents, faultEvent, migrationEvents, stepErrorEvent } from "./console-events.ts";
import { createPantinDocument } from "./pantin-document.ts";

const CONFLICT: DriveDiagnostic = "conflicting_commands";

// Only the ids of the drives matter to the comparison.
function documentWithDrives(...ids: string[]): PantinDocument {
  // Cast: a drive's other fields are irrelevant to these pure comparisons.
  const drives = ids.map((id) => ({ id })) as unknown as PantinDocument["drives"];
  return { ...createPantinDocument("Test"), drives };
}

describe("diagnosticEvents", () => {
  const document = documentWithDrives("valve", "other");

  it("raises a diagnostic that appears, as a warning", () => {
    const events = diagnosticEvents(document, new Map(), new Map([["valve", [CONFLICT]]]));
    expect(events).toEqual([
      {
        code: "diagnostic_raised",
        level: "warning",
        source: { kind: "drive", id: "valve" },
        params: { diagnostic: CONFLICT },
      },
    ]);
  });

  it("clears a diagnostic that goes away, as info", () => {
    const events = diagnosticEvents(document, new Map([["valve", [CONFLICT]]]), new Map());
    expect(events.map((event) => [event.code, event.level])).toEqual([
      ["diagnostic_cleared", "info"],
    ]);
  });

  it("says nothing while the diagnostics do not change", () => {
    const same = new Map([["valve", [CONFLICT]]]);
    expect(diagnosticEvents(document, same, new Map(same))).toEqual([]);
  });

  it("ignores the drives the document no longer holds", () => {
    expect(diagnosticEvents(document, new Map([["gone", [CONFLICT]]]), new Map())).toEqual([]);
  });
});

describe("migrationEvents", () => {
  it("says nothing for a current document", () => {
    expect(migrationEvents({ migratedFrom: null, bodiesFollowingGroup: [] })).toEqual([]);
  });

  it("lists the bodies that now follow their group, cut to a bounded text", () => {
    const [event] = migrationEvents({
      migratedFrom: 12,
      bodiesFollowingGroup: ["handle", "plate"],
    });
    expect(event).toMatchObject({
      code: "migrated",
      params: { from: 12, followers: "handle, plate" },
    });
    const [long] = migrationEvents({
      migratedFrom: 12,
      bodiesFollowingGroup: Array.from({ length: 80 }, (_, at) => `body-number-${at}`),
    });
    expect(ConsoleEventSchema.safeParse(long).success).toBe(true);
  });
});

describe("the other events", () => {
  it("builds events that the protocol accepts", () => {
    const events = [
      faultEvent({ kind: "joint", id: "stroke" }, "jammed", true),
      faultEvent({ kind: "drive", id: "valve" }, "unresponsive", false),
      ...migrationEvents({ migratedFrom: 3, bodiesFollowingGroup: ["a", "b"] }),
      stepErrorEvent(new Error("boom")),
    ];
    for (const event of events) {
      expect(ConsoleEventSchema.safeParse(event).success).toBe(true);
    }
    expect(events.map((event) => event.code)).toEqual([
      "fault_set",
      "fault_cleared",
      "migrated",
      "step_error",
    ]);
  });

  it("cuts a long error message and accepts a thrown non error", () => {
    const long = stepErrorEvent(new Error("x".repeat(1000)));
    expect(long.code === "step_error" && long.params.detail).toHaveLength(300);
    const odd = stepErrorEvent("plain text");
    expect(odd.code === "step_error" && odd.params.detail).toBe("plain text");
  });
});
