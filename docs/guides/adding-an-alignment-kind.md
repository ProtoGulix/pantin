# Adding an alignment kind

An alignment kind is two files, a few registration lines and its labels in
the viewer (ADR 0035 point 9). Nothing else in the core or the viewer tests a
kind by name: the route, the pick checks and the alignment panel read its
descriptor. An alignment is never stored, so a new kind changes no document
schema and needs no migration. The steps below use a hypothetical `example`
kind; replace it with the real name.

A kind stays core code: a part never brings one (CLAUDE.md section 11.3).

## 1. The descriptor, in the protocol

Create `packages/protocol/src/alignment-kinds/example.ts`:

```ts
import { type AlignmentKindDescriptor, alignmentRequestSchema } from "./common.ts";

// One line saying what the kind does to the moving assembly.
export const EXAMPLE: AlignmentKindDescriptor = {
  // In the order the user picks them. A plane role may accept the plane of a
  // triangle (fallback: true); a cylinder role never can.
  picks: [
    { side: "moving", face: "plane", fallback: true },
    { side: "target", face: "cylinder", fallback: false },
  ],
  // Among "flip", "offset" (metres) and "rotation" (radians).
  parameters: ["offset"],
};

export const ExampleRequestSchema = alignmentRequestSchema("example", EXAMPLE);
```

Register it in `packages/protocol/src/alignment.ts`: add the schema to
`AlignRequestSchema` and the descriptor to `ALIGNMENT_KINDS` (the compiler
asks for it).

## 2. The motion, in the core

Create `packages/core/src/domain/alignment-kinds/example.ts`, a pure
function from the connector frames of the picks (in the descriptor's order,
ADR 0035 point 4) and the parameters to the rigid motion of the moving
assembly, in the Pantin frame:

```ts
import { type AlignmentMotion, alignmentRefused, frameAt } from "./motion.ts";

export const EXAMPLE_MOTION: AlignmentMotion = (frames, { offset }) => {
  const moving = frameAt(frames, 0);
  const target = frameAt(frames, 1);
  // Refuse with alignmentRefused("…") when the picks cannot be aligned.
  // geometry.ts has the minimal rotation, turns about a line and the
  // three-step motion of point 5.
};
```

Register it in `packages/core/src/domain/alignment-kinds/registry.ts`.

## 3. Tests

- Add an aligned and a misaligned example to
  `packages/core/src/domain/alignment-kinds/contract.test.ts` (the compiler
  asks for them). The contract checks that the aligned example does not
  move, that the motion is rigid, and that nothing is left to align after it.
- Test what is specific to the kind next to the others in `kinds.test.ts`:
  its parameters and its refusals.

## 4. Labels, in the viewer

In `packages/viewer/src/alignment/alignment-labels.ts`, add the kind's name
to `ALIGNMENT_KIND_LABELS` and one label per pick to `ALIGNMENT_PICK_LABELS`
(the compiler asks for them), then add the kind to `ALIGNMENT_KIND_ORDER`,
where it takes its place in the panel's list (the compiler does not check
this one). Add the texts to both
`packages/viewer/src/i18n/locales/fr.json` and `en.json`.

Then `pnpm check`.
