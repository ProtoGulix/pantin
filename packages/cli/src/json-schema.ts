import { PantinDocumentSchema } from "@pantin/protocol";
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
