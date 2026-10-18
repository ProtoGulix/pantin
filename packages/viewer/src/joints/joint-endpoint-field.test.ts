import { describe, expect, it } from "vitest";
import { bodyOf, documentOf } from "../diagram/diagram-fixtures.ts";
import {
  endpointName,
  endpointOptions,
  endpointToField,
  fieldToEndpoint,
} from "./joint-endpoint-field.ts";

// The joint form keeps an end in one text field: a body id, or assembly:<key>.

const DOCUMENT = documentOf({
  assemblies: ["tool"],
  bodies: [{ ...bodyOf("rail", "tool"), name: "Rail" }],
});
const label = (name: string) => `Group: ${name}`;

describe("the form field of a joint end", () => {
  it("reads and writes a body as its id and a group as assembly:<key>", () => {
    expect(endpointToField({ kind: "body", id: "rail" })).toBe("rail");
    expect(endpointToField({ kind: "assembly", key: "tool" })).toBe("assembly:tool");
    expect(fieldToEndpoint("rail")).toEqual({ kind: "body", id: "rail" });
    expect(fieldToEndpoint("assembly:tool")).toEqual({ kind: "assembly", key: "tool" });
  });

  it("turns an empty field into a body id the protocol refuses", () => {
    expect(fieldToEndpoint("")).toEqual({ kind: "body", id: "" });
  });
});

describe("the options and names of the ends", () => {
  it("lists every body, then every assembly as a group", () => {
    // The fixture adds a body "frame" to the first assembly.
    expect(endpointOptions(DOCUMENT, label)).toEqual([
      { value: "frame", label: "frame" },
      { value: "rail", label: "Rail" },
      { value: "assembly:tool", label: "Group: TOOL" },
    ]);
  });

  it("names an end, and falls back to the id or key of a missing one", () => {
    expect(endpointName(DOCUMENT, { kind: "body", id: "rail" }, label)).toBe("Rail");
    expect(endpointName(DOCUMENT, { kind: "assembly", key: "tool" }, label)).toBe("Group: TOOL");
    expect(endpointName(DOCUMENT, { kind: "body", id: "ghost" }, label)).toBe("ghost");
    expect(endpointName(DOCUMENT, { kind: "assembly", key: "ghost" }, label)).toBe("Group: ghost");
  });
});
