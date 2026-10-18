import type { ConsoleEvent } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { emptyConsole } from "../domain/console-buffer.ts";
import { clockEvent, forcedTagWrittenEvent, plcModuleEvent } from "../domain/console-events.ts";
import { recordPlcLinkEvents } from "./console-record.ts";

function bench() {
  const lines: string[] = [];
  const context = {
    wallClock: () => new Date("2026-10-18T10:00:00.000Z"),
    writeBridgeCoreLine: (pantinId: string, level: string, text: string) =>
      lines.push(`${pantinId} ${level} ${text}`),
  };
  const openPantin = { console: emptyConsole("console-1"), stepCount: 0 };
  return { context, openPantin, lines };
}

describe("recordPlcLinkEvents", () => {
  it("records the events in the console and writes the PLC ones to the bridge log", () => {
    const { context, openPantin, lines } = bench();
    const events: ConsoleEvent[] = [
      plcModuleEvent("m1", { connected: true }),
      forcedTagWrittenEvent("verin1.verin1.coil_14", 0, 1),
    ];

    recordPlcLinkEvents(context, "axis", openPantin, events);

    expect(openPantin.console.entries.map((entry) => entry.code)).toEqual([
      "plc_connected",
      "forced_tag_written",
    ]);
    expect(lines).toEqual([
      "axis info PLC connected to module m1.",
      "axis error PLC write ignored on forced tag verin1.verin1.coil_14 (forced 0, PLC wrote 1).",
    ]);
  });

  it("leaves the other events out of the bridge log", () => {
    const { context, openPantin, lines } = bench();

    recordPlcLinkEvents(context, "axis", openPantin, [clockEvent(true, false)]);

    expect(openPantin.console.entries).toHaveLength(1);
    expect(lines).toEqual([]);
  });
});
