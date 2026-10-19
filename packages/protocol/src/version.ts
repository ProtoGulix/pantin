import { z } from "zod";

// The running core's build version (ADR 0058):
//
//   GET /api/version -> VersionResponse
//
// "0.2.0" on a release, "0.2.0+8b4e4c4" on a build after it. The viewer compares
// it with its own to spot a stale cached viewer.

export const VersionResponseSchema = z.object({ version: z.string().min(1) });
export type VersionResponse = z.infer<typeof VersionResponseSchema>;
