import { TRANSPORT_SYMBOL_WARNING_CODES } from "@pantin/transport-types/schemas";
import { z } from "zod";
import { KeySchema } from "./ids.ts";
import { IoMappingResponseSchema } from "./io-mapping.ts";
import { TagNameSchema } from "./tag.ts";

// Importing the variables of a PLC program (ADR 0064 points 10, 12 and 13). The
// user exports the symbol file from the PLC software; the core reads it, matches
// its variables to the mapped signals and answers a preview; the client then sends
// the exact list of assignments it wants. Symbols are never stored.
//
//   POST /api/pantins/:pantinId/io/symbols/preview[?format=<id>]
//        body: the file, application/xml or text/xml, at most SYMBOL_FILE_MAX_BYTES
//        -> SymbolImportPreview (changes nothing)
//   POST /api/pantins/:pantinId/io/variables   ApplyIoVariablesRequest
//        -> ApplyIoVariablesResponse (an unsaved edit, one mappingId change per batch)

export const SYMBOL_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const IO_VARIABLES_MAX_ENTRIES = 4000;
export const IO_VARIABLES_BODY_MAX_BYTES = 1024 * 1024;

export const SymbolPreviewQuerySchema = z.strictObject({
  format: z.string().min(1).max(64).optional(),
});
export type SymbolPreviewQuery = z.infer<typeof SymbolPreviewQuerySchema>;

export const SYMBOL_ACCESSES = ["read", "write", "read_write", "unknown"] as const;
export const SymbolAccessSchema = z.enum(SYMBOL_ACCESSES);

// A PLC variable as the client shows it: `reference` is its path without the
// application, the text that becomes a channel's variable.
export const SymbolSummarySchema = z.strictObject({
  reference: z.string().min(1),
  path: z.array(z.string().min(1)).min(1),
  iecType: z.string().min(1),
  access: SymbolAccessSchema,
  comment: z.string().nullable(),
  aliasOf: z.string().min(1).optional(),
  // Display only: an absolute address never decides a match.
  directAddress: z.string().min(1).optional(),
});
export type SymbolSummary = z.infer<typeof SymbolSummarySchema>;

export const SYMBOL_MATCH_RULES = ["exact", "normalised", "suffix"] as const;
export const SymbolMatchRuleSchema = z.enum(SYMBOL_MATCH_RULES);
export type SymbolMatchRule = z.infer<typeof SymbolMatchRuleSchema>;

// A remark about a variable or a refusal of an assignment, in the form of the other
// translatable problems of the I/O view (IoProblem): a closed `code` the client turns into
// a sentence in its language, the `values` that sentence interpolates (the keys are fixed
// per code), and the English `message` kept for the command line and the logs.
const SymbolNoticeShape = {
  values: z.record(z.string(), z.string()),
  message: z.string().min(1),
};

// The codes the core and the symbol reader emit; each transport adds its own.
export const SYMBOL_COMMON_WARNING_CODES = [
  // The reader of the file doubted something.
  "access_unknown",
  "nesting_too_deep",
  "type_undefined",
  "node_without_name",
  // The shared type table doubts a variable.
  "integer_may_not_fit",
] as const;
export const SYMBOL_WARNING_CODES = [
  ...SYMBOL_COMMON_WARNING_CODES,
  ...TRANSPORT_SYMBOL_WARNING_CODES,
] as const;
export const SymbolWarningCodeSchema = z.enum(SYMBOL_WARNING_CODES);
export type SymbolWarningCode = z.infer<typeof SymbolWarningCodeSchema>;

export const SymbolWarningSchema = z.strictObject({
  code: SymbolWarningCodeSchema,
  ...SymbolNoticeShape,
});
export type SymbolWarning = z.infer<typeof SymbolWarningSchema>;

// "compatible": safe. "warning": probably right, to check (a narrower integer, a
// transport remark). "incompatible": the type cannot carry the signal; it is
// shown but never applied.
export const SYMBOL_COMPATIBILITIES = ["compatible", "warning", "incompatible"] as const;
export const SymbolCompatibilitySchema = z.enum(SYMBOL_COMPATIBILITIES);
export type SymbolCompatibility = z.infer<typeof SymbolCompatibilitySchema>;

// One channel and the variable that suits it. For an `unchanged` entry the
// proposed variable is the current one.
export const SymbolMatchSchema = z.strictObject({
  module: KeySchema,
  tag: TagNameSchema,
  currentVariable: z.string(),
  proposedVariable: z.string().min(1),
  symbol: SymbolSummarySchema,
  rule: SymbolMatchRuleSchema,
  compatibility: SymbolCompatibilitySchema,
  warnings: z.array(SymbolWarningSchema),
});
export type SymbolMatch = z.infer<typeof SymbolMatchSchema>;

// A channel with no sure match; `candidates` are the variables that fit it
// ambiguously, empty when none does.
export const UnmatchedSignalSchema = z.strictObject({
  module: KeySchema,
  tag: TagNameSchema,
  currentVariable: z.string(),
  candidates: z.array(SymbolSummarySchema),
});
export type UnmatchedSignal = z.infer<typeof UnmatchedSignalSchema>;

export const UNUSED_SYMBOL_REASONS = [
  "no_signal",
  "incompatible_type",
  "invalid_reference",
] as const;
export const UnusedSymbolReasonSchema = z.enum(UNUSED_SYMBOL_REASONS);
export type UnusedSymbolReason = z.infer<typeof UnusedSymbolReasonSchema>;

export const UnusedSymbolSchema = z.strictObject({
  symbol: SymbolSummarySchema,
  reason: UnusedSymbolReasonSchema,
});
export type UnusedSymbol = z.infer<typeof UnusedSymbolSchema>;

// Why the core proposes a module setting. One code today; the client translates it.
export const MODULE_PROPOSAL_REASONS = ["from_project_info"] as const;
export const ModuleProposalReasonSchema = z.enum(MODULE_PROPOSAL_REASONS);
export type ModuleProposalReason = z.infer<typeof ModuleProposalReasonSchema>;

// A hint for an OPC UA module: the NodeId prefix the symbol file suggests. It is "to
// check" (the NodeId may use the runtime name, not the device name of the file), so the
// core never applies it: the user does, with PATCH .../io/modules/:key and
// `transport.nodeIdPrefix`, a request apart from POST .../io/variables.
export const ModuleProposalSchema = z.strictObject({
  module: KeySchema,
  nodeIdPrefix: z.string().min(1).max(255),
  reason: ModuleProposalReasonSchema,
});
export type ModuleProposal = z.infer<typeof ModuleProposalSchema>;

export const SymbolImportPreviewSchema = z.strictObject({
  // The id of the format that read the file.
  format: z.string().min(1),
  // For display only; null when the file does not say.
  project: z
    .strictObject({ name: z.string(), deviceName: z.string(), applicationName: z.string() })
    .nullable(),
  symbolCount: z.number().int().min(0),
  // What the reader doubted (an access spelling nobody has seen, a nesting too deep).
  warnings: z.array(SymbolWarningSchema),
  proposals: z.array(SymbolMatchSchema),
  unchanged: z.array(SymbolMatchSchema),
  unmatchedSignals: z.array(UnmatchedSignalSchema),
  unusedSymbols: z.array(UnusedSymbolSchema),
  // Only OPC UA modules whose prefix differs from the one the file suggests.
  moduleProposals: z.array(ModuleProposalSchema),
});
export type SymbolImportPreview = z.infer<typeof SymbolImportPreviewSchema>;

export const IoVariableAssignmentSchema = z.strictObject({
  module: KeySchema,
  tag: TagNameSchema,
  // Free text here, like IoChannel.variable: the core checks it against the CODESYS rules.
  variable: z.string().min(1).max(255),
});
export type IoVariableAssignment = z.infer<typeof IoVariableAssignmentSchema>;

export const ApplyIoVariablesRequestSchema = z.strictObject({
  assignments: z.array(IoVariableAssignmentSchema).min(1).max(IO_VARIABLES_MAX_ENTRIES),
});
export type ApplyIoVariablesRequest = z.infer<typeof ApplyIoVariablesRequestSchema>;

// Why an assignment is refused. The `values` keys of each code are in the comments of
// the core's producers; the English message says what to fix.
export const SKIP_REASON_CODES = [
  "module_not_found",
  "tag_not_mapped",
  "variable_too_many_parts",
  "variable_too_long",
  "variable_invalid_name",
  "variable_reserved_name",
  "channel_assigned_twice",
  "variable_shared",
] as const;
export const SkipReasonCodeSchema = z.enum(SKIP_REASON_CODES);
export type SkipReasonCode = z.infer<typeof SkipReasonCodeSchema>;

export const SkipReasonSchema = z.strictObject({
  code: SkipReasonCodeSchema,
  ...SymbolNoticeShape,
});
export type SkipReason = z.infer<typeof SkipReasonSchema>;

export const SkippedAssignmentSchema = z.strictObject({
  ...IoVariableAssignmentSchema.shape,
  reason: SkipReasonSchema,
});
export type SkippedAssignment = z.infer<typeof SkippedAssignmentSchema>;

// The whole mapping after the batch, as every I/O edit answers, plus what happened to each entry.
export const ApplyIoVariablesResponseSchema = z.object({
  ...IoMappingResponseSchema.shape,
  applied: z.array(IoVariableAssignmentSchema),
  skipped: z.array(SkippedAssignmentSchema),
});
export type ApplyIoVariablesResponse = z.infer<typeof ApplyIoVariablesResponseSchema>;
