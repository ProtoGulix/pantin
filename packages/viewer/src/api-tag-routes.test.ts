import { describe, expect, it } from "vitest";
import { createPantinApiClient } from "./api-client.ts";
import { fakeFetch, jsonResponse } from "./api-test-helpers.ts";

// Tag routes: a write forces its tag, the two DELETE routes release it (ADR 0045 point 5).

describe("PantinApiClient tags", () => {
  it("writes a tag with PUT, its name encoded in the URL", async () => {
    const tag = {
      name: "main.valve.coil_14",
      type: "bit",
      direction: "command",
      value: 1,
      forced: true,
    };
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ tag }));
    expect(
      await createPantinApiClient(fetchFunction).writeTag("press", "main.valve.coil_14", 1),
    ).toEqual(tag);
    expect(requests[0]?.url).toBe("/api/pantins/press/tags/main.valve.coil_14");
  });

  it("releases one tag with DELETE on its force route", async () => {
    const tag = {
      name: "main.valve.coil_14",
      type: "bit",
      direction: "command",
      value: 1,
      forced: false,
    };
    const { fetchFunction, requests } = fakeFetch(jsonResponse({ tag }));
    expect(
      await createPantinApiClient(fetchFunction).releaseTag("press", "main.valve.coil_14"),
    ).toEqual(tag);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "DELETE",
      "/api/pantins/press/tags/main.valve.coil_14/force",
    ]);
  });

  it("releases every tag with DELETE and returns the tag list", async () => {
    const answer = { stepCount: 0, tags: [], drives: [] };
    const { fetchFunction, requests } = fakeFetch(jsonResponse(answer));
    expect(await createPantinApiClient(fetchFunction).releaseAllTags("press")).toEqual(answer);
    expect([requests[0]?.init?.method, requests[0]?.url]).toEqual([
      "DELETE",
      "/api/pantins/press/forces",
    ]);
  });
});
