import { describe, expect, it } from "vitest";
import { createTranslator, LANGUAGES } from "../i18n/translate.ts";
import { diagnosticLines, nextDiagnosticUpdate, runtimeByDriveId } from "./drive-diagnostics.ts";

describe("drive diagnostics", () => {
  it("words each diagnostic in the language, keeping its id", () => {
    const lines = diagnosticLines(
      ["conflicting_commands"],
      "valve_5_3_closed",
      createTranslator("fr"),
    );
    expect(lines).toEqual([
      {
        id: "conflicting_commands",
        text: "Commandes contradictoires : les deux bobines sont actives ; le tiroir reste en place.",
      },
    ]);
  });

  it("words it for a contactor without coils or spool", () => {
    const [line] = diagnosticLines(
      ["conflicting_commands"],
      "reversing_contactor",
      createTranslator("fr"),
    );
    expect(line?.text).toContain("contacteur");
    expect(line?.text).not.toContain("bobine");
  });

  it("words it neutrally for a drive with neither coils nor contactor", () => {
    const [line] = diagnosticLines(["conflicting_commands"], "vfd_on_off", createTranslator("fr"));
    expect(line?.text).not.toContain("bobine");
    expect(line?.text).not.toContain("contacteur");
  });

  it("has a text in every language and none for a clear drive", () => {
    for (const language of LANGUAGES) {
      const t = createTranslator(language);
      expect(diagnosticLines(["conflicting_commands"], "reversing_contactor", t)[0]?.text).not.toBe(
        "",
      );
      expect(diagnosticLines([], "valve_5_3_closed", t)).toEqual([]);
    }
  });

  it("keys the runtime by drive id, ports included for the diagram", () => {
    const runtime = runtimeByDriveId([
      { id: "valve", ports: { port_2: "exhaust" }, diagnostics: [] },
    ]);
    expect(runtime.get("valve")?.ports).toEqual({ port_2: "exhaust" });
    expect(runtime.get("ghost")).toBeUndefined();
  });
});

describe("nextDiagnosticUpdate", () => {
  const t = createTranslator("fr");

  it("draws a diagnostic that appears, then nothing while it is unchanged", () => {
    const first = nextDiagnosticUpdate("", ["conflicting_commands"], "valve_5_3_closed", t);
    expect(first?.lines).toHaveLength(1);
    expect(
      nextDiagnosticUpdate(first?.signature ?? "", ["conflicting_commands"], "valve_5_3_closed", t),
    ).toBeNull();
  });

  it("draws nothing for a clear card, and clears a warning that goes away", () => {
    expect(nextDiagnosticUpdate("", [], "valve_5_3_closed", t)).toBeNull();
    const shown = nextDiagnosticUpdate("", ["conflicting_commands"], "valve_5_3_closed", t);
    expect(nextDiagnosticUpdate(shown?.signature ?? "", [], "valve_5_3_closed", t)).toEqual({
      signature: "",
      lines: [],
    });
  });

  it("tells a drive that appears or disappears from the answer apart from an unchanged one", () => {
    // A drive absent from the answer has no diagnostics: a shown warning clears.
    const shown = nextDiagnosticUpdate("", ["conflicting_commands"], "reversing_contactor", t);
    expect(
      nextDiagnosticUpdate(shown?.signature ?? "", [], "reversing_contactor", t)?.lines,
    ).toEqual([]);
    expect(nextDiagnosticUpdate("", [], "reversing_contactor", t)).toBeNull();
  });
});
