# Adding a joint type

A joint type is two files and a few registration lines (ADR 0013). Nothing
else in the core tests a joint type by name: kinematics, tags and the REST
API pick the new type up from the registry. The steps below use a
hypothetical `example` type; replace it with the real name.

Before you start: a joint type has exactly one coordinate (or none). A type
with several coordinates (cylindrical, spherical, planar) needs an ADR first,
because it changes the behaviour interface and the tags.

## 1. The contract, in the protocol

Create `packages/protocol/src/joint-types/example.ts`:

```ts
import { z } from "zod";
import { type JointCoordinateUnit, jointFields, LimitsSchema } from "./common.ts";

// One line saying what the joint does mechanically.
export const ExampleJointRequestSchema = z.object({
  type: z.literal("example"),
  ...jointFields,
  limits: LimitsSchema, // only if the coordinate is bounded
  // fields specific to this type, each with a comment giving its unit
});

export const EXAMPLE_COORDINATE_UNIT: JointCoordinateUnit = "metre"; // or "radian", or null
```

Then register it in `packages/protocol/src/joint.ts`:

1. add `ExampleJointRequestSchema` to the list in `CreateJointRequestSchema`;
2. add `example: EXAMPLE_COORDINATE_UNIT` to `JOINT_COORDINATE_UNITS` (the
   compiler asks for it as soon as step 1 is done).

## 2. The behaviour, in the core

Create `packages/core/src/domain/joint-types/example.ts`:

```ts
import type { Joint } from "@pantin/protocol";
import { clampToLimits, type JointBehaviour, rotationAboutAxis } from "./behaviour.ts";

type ExampleJoint = Extract<Joint, { type: "example" }>;

export const EXAMPLE_BEHAVIOUR: JointBehaviour<ExampleJoint> = {
  clamp: (joint, coordinate) => clampToLimits(joint.limits, coordinate),
  // Replace with M(q) of the new type, in the Pantin frame.
  motion: (joint, coordinate) => rotationAboutAxis(joint.origin, joint.axis, coordinate),
};
```

`behaviour.ts` provides `clampToLimits` and `rotationAboutAxis`;
`rigid-transform.ts` provides the vector and quaternion algebra. A pure
translation along the axis is
`{ rotation: IDENTITY_ROTATION, translation: scale(normalize(joint.axis), coordinate) }`
(see `prismatic.ts`), and `compose` chains two motions (see `helical.ts`).
Keep the functions pure.

Zod's `z.number()` accepts `Infinity`: refine every numeric parameter so that
it is finite, and exclude the values that would make the motion blow up
(for instance a zero pitch).

Register it in `packages/core/src/domain/joint-types/registry.ts`
(`example: EXAMPLE_BEHAVIOUR`); the compiler asks for it.

## 3. The tests

1. Add an example joint to `EXAMPLES` in
   `packages/core/src/domain/joint-types/contract.test.ts` (the compiler asks
   for it). The shared invariants then run on it: schema, `M(0)` identity,
   rigid motion, clamping.
2. Create `example.test.ts` next to the behaviour for what only this type
   does (for instance, a known point after a known coordinate). The existing
   types show the pattern (`prismatic.test.ts`, `revolute.test.ts`); a type
   with nothing specific, like `fixed`, needs none.
3. Add the specific validation rules of the new fields to
   `packages/protocol/src/joint.test.ts` (accepted and refused values).
4. Optional but recommended for a type that can move: an end-to-end test in
   `packages/core/src/http/tags.test.ts` that writes its setpoint tag and
   reads the pose (see the helical joint test).

## 4. The schema version

A new type changes what `pantin.json` may contain, so:

1. increase `PANTIN_SCHEMA_VERSION` in `packages/protocol/src/pantin.ts` and
   add a line to the version comment above it;
2. add a migration step in `packages/core/src/domain/migrations.ts` that only
   changes `schema_version` (existing documents stay valid);
3. add its case to `migrations.test.ts`.

Tests elsewhere use `PANTIN_SCHEMA_VERSION` and need no change.

## 5. Finish

1. If the type brings a new concept (a coordinate that is neither a
   translation nor a rotation, a coupling, a new parameter unit), write an
   ADR in `docs/decisions`.
2. `pnpm check` must be green; the reviewer runs before the commit.
