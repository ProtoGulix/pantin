# Adding a drive type

A drive type is one folder in `packages/drive-types/src/` and one line in each
of its three registries (ADR 0022). Nothing else in the core, the protocol or
the viewer names a drive type: the simulation step, the tags, the REST API and
the drives panel pick the new type up from the registries. The steps below
use a hypothetical `example_drive` type in `src/example-drive/`; replace it
with the real name.

Before you start:

- A drive moves one or more joints of one coordinate unit (metres or radians)
  and has fixed tags. A variant with other tags (a second coil, a bit command
  instead of an analog one) is another type, not an option.
- The behaviour is code. It is reviewed like any core change and never loaded
  at run time from elsewhere (CLAUDE.md section 11.3); a drive type without
  code is a backlog idea (docs/backlog/declarative-drives.md).

## 1. The schema: `schema.ts`

Data only, since the protocol imports it; a dependency rule refuses any import
of a behaviour from here.

```ts
import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// One line saying what the actuator does.
export const ExampleDriveFieldsSchema = z.object({
  type: z.literal("example_drive"),
  speed: positiveRate("speed"),
});

// Speeds are per second, accelerations per second squared, in the unit of the
// driven joints; the drives panel shows them in mm or degrees.
export const EXAMPLE_DRIVE_PARAMETERS = [
  { field: "speed", kind: "speed" },
] as const satisfies readonly DriveParameter[];

// Members are lowercase English words ("run", "speed_setpoint"). A float tag
// says what it measures ("position" or "speed") so clients can show its unit.
export const EXAMPLE_DRIVE_TAGS = [
  { member: "run", type: "bit", direction: "command" },
  { member: "speed", type: "float", direction: "feedback", quantity: "speed" },
] as const satisfies readonly DriveTag[];
```

## 2. The behaviour: `behaviour.ts`

One simulation step (1/120 s) as a pure function of plain numbers. Use the
helpers of `behaviour-common.ts` (`isSet`, `rampToward`, `travelAtSpeed`,
`moveAtVelocity`, `holdPosition`) rather than your own arithmetic.

```ts
import type { z } from "zod";
import { type DriveBehaviour, isSet, moveAtVelocity } from "../behaviour-common.ts";
import type { ExampleDriveFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleDriveFieldsSchema>;

// Why it moves the way it does, in a comment.
export const exampleDrive: DriveBehaviour<Fields> = {
  step: ({ fields, commands, joints, dt }) => {
    const speed = isSet(commands, "run") ? fields.speed : 0;
    return {
      joints: joints.map((joint) => moveAtVelocity(joint, speed, dt)),
      state: {},
      feedback: { speed },
    };
  },
};
```

The core handles the faults (a jammed joint, an unresponsive drive) around
your behaviour: do not handle them here.

## 3. The labels: `labels.ts`

English and French. The type after `satisfies` makes a missing or misspelled
label a compile error.

```ts
import type { DriveTypeLabels } from "../schema-common.ts";
import type { EXAMPLE_DRIVE_PARAMETERS, EXAMPLE_DRIVE_TAGS } from "./schema.ts";

export const EXAMPLE_DRIVE_LABELS = {
  en: { name: "Example drive", parameters: { speed: "Speed" }, tags: { run: "Run", speed: "Actual speed" } },
  fr: { name: "Drive d'exemple", parameters: { speed: "Vitesse" }, tags: { run: "Marche", speed: "Vitesse réelle" } },
} satisfies DriveTypeLabels<
  (typeof EXAMPLE_DRIVE_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_DRIVE_TAGS)[number]["member"]
>;
```

## 4. The registries

Add the new entry to each; the records are keyed by type, so the compiler
lists every place you missed:

- `src/schemas.ts`: the schema in `DriveFieldsSchema`, then
  `DRIVE_PARAMETERS` and `DRIVE_TAGS`;
- `src/behaviours.ts`: `DRIVE_BEHAVIOURS`;
- `src/labels.ts`: `DRIVE_LABELS`.

## 5. Tests, then the schema version

- In `src/behaviours.test.ts`, step the behaviour through `stepDrive` at
  1/120 s: each command, the limits, and every bound the type promises (a
  speed, an acceleration) at every step, the stop included.
- `src/schemas.test.ts` checks the registries on its own.
- A new drive type changes what `pantin.json` accepts: raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` for the JSON Schema (ADR 0021).
- `pnpm check` must pass before the commit.
