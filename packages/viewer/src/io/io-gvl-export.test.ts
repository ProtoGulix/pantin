import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ioGvlExportOf } from "./io-gvl-export.ts";
import { NO_IO_STATE } from "./io-state.ts";

const answer = (status: IoMappingResponse["status"]): IoMappingResponse => ({
  status,
  mappingId: null,
  modules: [],
  problems: [],
  unmappedTags: [],
});

const stateWith = (status: IoMappingResponse["status"]) => ({
  ...NO_IO_STATE,
  mapping: answer(status),
});

describe("ioGvlExportOf", () => {
  it("is unavailable while the mapping is not known", () => {
    expect(ioGvlExportOf(NO_IO_STATE)).toEqual({ enabled: false, titleKey: "io.gvl.unknown" });
  });

  it("is unavailable without io.json, and says to create the mapping", () => {
    expect(ioGvlExportOf(stateWith("missing"))).toEqual({
      enabled: false,
      titleKey: "io.gvl.missing",
    });
  });

  it("is unavailable while the mapping has problems", () => {
    expect(ioGvlExportOf(stateWith("invalid"))).toEqual({
      enabled: false,
      titleKey: "io.gvl.invalid",
    });
  });

  it("is available for a valid mapping", () => {
    expect(ioGvlExportOf(stateWith("valid"))).toEqual({ enabled: true, titleKey: "io.gvl.title" });
  });
});
