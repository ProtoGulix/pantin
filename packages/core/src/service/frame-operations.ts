import type { AlignFramesResponse, PantinId } from "@pantin/protocol";
import { alignFramesOnJoint } from "../domain/align-frames.ts";
import { applyOutcomeEdit } from "./assembly-operations.ts";
import type { ServiceContext } from "./open-pantins.ts";

// Align the frames on a joint axis (ADR 0056): one document edit, so a refusal
// leaves the Pantin untouched. Nothing moves, so the runtime state is kept.

export function frameOperations(context: ServiceContext) {
  return {
    alignFrames: async (pantinId: PantinId, jointId: string): Promise<AlignFramesResponse> => {
      const { outcome, response } = await applyOutcomeEdit(context, pantinId, (document) =>
        alignFramesOnJoint(document, jointId),
      );
      return {
        pantin: response,
        reframedAssemblies: outcome.reframedAssemblies,
        rewrittenJoints: outcome.rewrittenJoints.map(({ id, name }) => ({ id, name })),
      };
    },
  };
}
