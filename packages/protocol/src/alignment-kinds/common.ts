import { z } from "zod";
import { BodyIdSchema } from "../ids.ts";
import { Vector3Schema } from "../joint-types/common.ts";

// What every alignment kind shares (ADR 0035 points 9 and 10). A kind is
// described as data, so that the core checks the picks and the viewer builds
// its dialog without testing the kind by name.

// A pick, in the Pantin frame as displayed, metres. A face of the body's face
// file (ADR 0035 point 2), or, without one, the plane of the picked triangle.
export const AlignmentPickSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("face"),
    body: BodyIdSchema,
    face: z.number().int().nonnegative(),
    point: Vector3Schema,
  }),
  z.object({
    kind: z.literal("plane"),
    body: BodyIdSchema,
    point: Vector3Schema,
    normal: Vector3Schema.refine(
      ([x, y, z]) => Math.hypot(x, y, z) > 1e-9,
      "The normal must not be the zero vector.",
    ),
  }),
]);
export type AlignmentPick = z.infer<typeof AlignmentPickSchema>;

// Side of a pick: on the assembly that moves, or on what it is aligned to.
export type AlignmentSide = "moving" | "target";

// The face a pick needs: a plane (a fallback plane will do when `fallback`)
// or a cylinder, whose axis no fallback pick can give.
export type AlignmentPickRole =
  | { side: AlignmentSide; face: "plane"; fallback: true }
  | { side: AlignmentSide; face: "cylinder"; fallback: false };

// flip: the other way round; offset: metres along the target direction;
// rotation: radians about the target direction (ADR 0035 point 5).
export type AlignmentParameter = "flip" | "offset" | "rotation";

export type AlignmentKindDescriptor = {
  picks: readonly AlignmentPickRole[];
  parameters: readonly AlignmentParameter[];
};

const PARAMETER_FIELDS: readonly AlignmentParameter[] = ["flip", "offset", "rotation"];

// The request of one kind: its picks, in the descriptor's order, and the
// parameters, each optional (false or 0 when absent). A parameter the kind
// does not use is refused rather than ignored.
export function alignmentRequestSchema<Kind extends string>(
  kind: Kind,
  descriptor: AlignmentKindDescriptor,
) {
  return z
    .object({
      kind: z.literal(kind),
      picks: z.array(AlignmentPickSchema).length(descriptor.picks.length),
      flip: z.boolean().optional(),
      offset: z.number().finite().optional(),
      rotation: z.number().finite().optional(),
    })
    .strict()
    .superRefine((request, context) => {
      for (const parameter of PARAMETER_FIELDS) {
        if (request[parameter] !== undefined && !descriptor.parameters.includes(parameter)) {
          context.addIssue({
            code: "custom",
            path: [parameter],
            message: `The ${kind} alignment has no ${parameter} parameter.`,
          });
        }
      }
    });
}
