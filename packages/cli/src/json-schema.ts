import { IoDocumentSchema, PantinDocumentSchema } from "@pantin/protocol";
import { z } from "zod";

// The JSON Schema of pantin.json, generated from the Zod schema (ADR 0021),
// for editors and tools outside TypeScript. It covers the shape only.
export function pantinJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(PantinDocumentSchema),
    title: "Pantin document (pantin.json)",
    description:
      "Shape of a Pantin document. The joint tree, the assemblies and the tag keys follow further rules that only `pnpm pantin validate` checks.",
  };
}

/** The committed file's text: two-space indentation and a final newline. */
export function pantinJsonSchemaText(): string {
  return `${JSON.stringify(pantinJsonSchema(), null, 2)}\n`;
}

// The JSON Schema of io.json (ADR 0049 point 2), a second public schema. The
// rules that need the document (tags, zones, overlaps) are the core's, shown
// by `pantin validate` and GET /api/pantins/:pantinId/io.
export function ioJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(IoDocumentSchema),
    title: "Pantin I/O mapping (io.json)",
    description:
      "Shape of the I/O mapping of a Pantin. Whether each tag exists, fits its zone and type, and whether addresses overlap is checked against pantin.json by the core.",
  };
}

export function ioJsonSchemaText(): string {
  return `${JSON.stringify(ioJsonSchema(), null, 2)}\n`;
}
