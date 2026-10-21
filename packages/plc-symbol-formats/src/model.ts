import { z } from "zod";

// The neutral model every symbol format produces (ADR 0064 point 10): what
// Pantin needs of a PLC variable to propose it as the variable of a channel.
// Symbols are never stored; they exist between a preview and an apply.

export const MAX_SYMBOLS = 50_000;

export const PLC_SYMBOL_ACCESSES = ["read", "write", "read_write", "unknown"] as const;
export const PlcSymbolAccessSchema = z.enum(PLC_SYMBOL_ACCESSES);
export type PlcSymbolAccess = z.infer<typeof PlcSymbolAccessSchema>;

export const PlcSymbolSchema = z.strictObject({
  // The segments from the root, the application first (Application, GVL, speed).
  path: z.array(z.string().min(1)).min(1),
  // The IEC text of the type: BOOL, ARRAY [0..10] OF INT, Point.
  iecType: z.string().min(1),
  access: PlcSymbolAccessSchema,
  comment: z.string().nullable(),
  // The type this one is an alias of, when the file says so (XWORD of LWORD).
  aliasOf: z.string().min(1).optional(),
  // An absolute address such as %IW1, for display only: it never decides a match.
  directAddress: z.string().min(1).optional(),
});
export type PlcSymbol = z.infer<typeof PlcSymbolSchema>;

export const PlcProjectInfoSchema = z.strictObject({
  name: z.string(),
  deviceName: z.string(),
  applicationName: z.string(),
});
export type PlcProjectInfo = z.infer<typeof PlcProjectInfoSchema>;

export const PlcSymbolListSchema = z.strictObject({
  // For display only; null when the file does not say.
  project: PlcProjectInfoSchema.nullable(),
  symbols: z.array(PlcSymbolSchema),
  // What was read with a doubt (an access spelling nobody has seen, a nesting too deep).
  warnings: z.array(z.string()),
});
export type PlcSymbolList = z.infer<typeof PlcSymbolListSchema>;

export const ParseProblemSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
});
export type ParseProblem = z.infer<typeof ParseProblemSchema>;

export type ParseResult =
  | { ok: true; list: PlcSymbolList }
  | { ok: false; problems: ParseProblem[] };

/** One vendor file format: a folder of its own, listed in formats.ts. */
export interface PlcSymbolFormat {
  id: string;
  /** True when the text looks like this format's file; cheap, it reads the root tag only. */
  detect(text: string): boolean;
  parse(text: string): ParseResult;
}
