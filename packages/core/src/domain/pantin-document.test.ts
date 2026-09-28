import { describe, expect, it } from "vitest";
import {
  createPantinDocument,
  parsePantinDocument,
  renamePantinDocument,
  serializePantinDocument,
} from "./pantin-document.ts";

describe("pantin document", () => {
  it("round-trips through its serialized form", () => {
    const document = renamePantinDocument(createPantinDocument("Axe"), "Axe X");
    expect(parsePantinDocument(serializePantinDocument(document), "pantin.json")).toEqual(document);
  });

  it("names the file and the problem when the JSON is broken", () => {
    expect(() => parsePantinDocument("{ nope", "/p/axe/pantin.json")).toThrow(
      /\/p\/axe\/pantin.json is not valid JSON/,
    );
  });

  it("lists schema violations with their location", () => {
    const text = JSON.stringify({ schema_version: 1, name: "", bodies: [] });
    expect(() => parsePantinDocument(text, "pantin.json")).toThrow(/name: Name must not be empty/);
  });
});
