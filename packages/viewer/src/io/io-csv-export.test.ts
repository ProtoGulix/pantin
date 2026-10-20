import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ioCsvExportOf } from "./io-csv-export.ts";
import { NO_IO_STATE } from "./io-state.ts";

const stateWith = (status: IoMappingResponse["status"]) => ({
  ...NO_IO_STATE,
  mapping: { status, mappingId: null, modules: [], problems: [], unmappedTags: [] },
});

describe("ioCsvExportOf", () => {
  it("is available for a valid mapping only, like the GVL export", () => {
    expect(ioCsvExportOf(stateWith("valid"))).toEqual({ enabled: true, titleKey: "io.csv.title" });
    for (const status of ["missing", "invalid"] as const) {
      expect(ioCsvExportOf(stateWith(status))).toEqual({
        enabled: false,
        titleKey: "io.csv.unavailable",
      });
    }
    expect(ioCsvExportOf(NO_IO_STATE).enabled).toBe(false);
  });
});
