# Adding a drive type

A drive is what the PLC commands: a valve, a contactor, a variable speed
drive, a servo drive (ADR 0022, 0028). A drive type is one folder in
`packages/drive-types/src/` and one line in each of its three registries.
Nothing else in the core, the protocol or the viewer names a drive type: the
simulation step, the tags, the REST API and the drives panel pick the new type
up from the registries. The steps below use a hypothetical `example_drive`
type in `src/example-drive/`; replace it with the real name.

Before you start:

- A drive moves no joint. Its behaviour answers the state of its **output
  ports**, which actuators read (ADR 0028 point 2), and its feedback tags. The
  actuator that moves joints is another type (docs/guides/adding-an-actuator-type.md).
- A drive has fixed tags. A variant with other tags (a second coil, a bit
  command instead of an analog one) is another type, not an option.
- The behaviour is code. It is reviewed like any core change and never loaded
  at run time from elsewhere (CLAUDE.md section 11.3); a drive type without
  code is a backlog idea (docs/backlog/declarative-drives.md).

## 1. The schema: `schema.ts`

Data only, since the protocol imports it; a dependency rule refuses any import
of a behaviour from here.

```ts
import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// One line saying what the drive does.
export const ExampleDriveFieldsSchema = z.object({
  type: z.literal("example_drive"),
  acceleration: positiveRate("acceleration"),
});

// Speeds are per second, accelerations per second squared, in the unit of the
// moved joints ("speed", "acceleration"); a ramp in percent of a nominal speed
// per second is "percent_per_second". Clients show them in mm or degrees.
export const EXAMPLE_DRIVE_PARAMETERS = [
  { field: "acceleration", kind: "percent_per_second" },
] as const satisfies readonly DriveParameter[];

// Output ports: a name and the domain of what they carry (`pneumatic`,
// `ac_power`, `servo`; the states are in `src/ports.ts`). Actuators are fed
// through these names, so a new one is as good as a new tag name.
export const EXAMPLE_DRIVE_PORTS = [
  { name: "out", domain: "ac_power" },
] as const satisfies readonly DrivePort[];

// Members are lowercase English words, digits allowed after the first letter
// ("run", "speed_setpoint", "coil_14"). A float tag says what it measures
// ("position", "speed" or "percent") so clients can show its unit.
export const EXAMPLE_DRIVE_TAGS = [
  { member: "run", type: "bit", direction: "command" },
  { member: "speed", type: "float", direction: "feedback", quantity: "percent" },
] as const satisfies readonly DriveTag[];
```

A new domain (a new kind of port state) is a change of `src/ports.ts`: add its
state schema there, then an actuator type that reads it.

## 2. The behaviour: `behaviour.ts`

One simulation step (1/120 s) as a pure function of plain numbers. It answers
the state of every output port it declares, its own state for the next step,
its feedback, and the diagnostics it detects. Use the helpers of
`behaviour-common.ts` (`isSet`, `rampToward`, `clamp`) rather than your own
arithmetic.

```ts
import type { z } from "zod";
import { isSet, rampToward } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import type { ExampleDriveFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleDriveFieldsSchema>;

// Why it answers what it answers, in a comment.
export const exampleDrive: DriveStepBehaviour<Fields> = {
  step: ({ fields, commands, state, dt }) => {
    const target = isSet(commands, "run") ? 100 : 0;
    const speed = rampToward(state.speed ?? 0, target, fields.acceleration * dt);
    return {
      ports: { out: { direction: 1, ratio: speed / 100 } },
      state: { speed },
      feedback: { speed },
      // "conflicting_commands" when the PLC commands what a real machine would
      // not survive well; it is runtime state, never a tag (ADR 0028 point 5).
      diagnostics: [],
    };
  },
};
```

The core handles the faults (an unresponsive drive, a jammed joint) around
your behaviour: do not handle them here. A servo drive also receives
`jointPositions`, those of the joints it moves in the end.

## 3. The labels: `labels.ts`

English and French, with one label per parameter, tag member and output port.
The type after `satisfies` makes a missing or misspelled label a compile error.
Sockets of the diagram read the port labels (ADR 0030 point 5).

```ts
import type { DriveTypeLabels } from "../schema-common.ts";
import type {
  EXAMPLE_DRIVE_PARAMETERS,
  EXAMPLE_DRIVE_PORTS,
  EXAMPLE_DRIVE_TAGS,
} from "./schema.ts";

export const EXAMPLE_DRIVE_LABELS = {
  en: { name: "Example drive", parameters: { acceleration: "Acceleration" }, tags: { run: "Run", speed: "Actual speed" }, ports: { out: "Output" } },
  fr: { name: "Drive d'exemple", parameters: { acceleration: "Accélération" }, tags: { run: "Marche", speed: "Vitesse réelle" }, ports: { out: "Sortie" } },
} satisfies DriveTypeLabels<
  (typeof EXAMPLE_DRIVE_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_DRIVE_TAGS)[number]["member"],
  (typeof EXAMPLE_DRIVE_PORTS)[number]["name"]
>;
```

## 4. The registries

Add the new entry to each; the records are keyed by type, so the compiler
lists every place you missed:

- `src/schemas.ts`: the schema in `DriveFieldsSchema`, then
  `DRIVE_PARAMETERS`, `DRIVE_TAGS` and `DRIVE_PORTS`;
- `src/behaviours.ts`: `DRIVE_BEHAVIOURS`;
- `src/labels.ts`: `DRIVE_LABELS`.

## 5. Tests, then the schema version

- Step the behaviour through `stepDrive` at 1/120 s, as `src/valves.test.ts`
  and `src/ac-drives.test.ts` do: each command, the ports answered, the
  diagnostics, and every bound the type promises at every step.
- `src/schemas.test.ts` and `src/drives.test.ts` check the registries and that
  the ports answered are those declared, in their domain.
- A new drive type changes what `pantin.json` accepts: raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` for the JSON Schema (ADR 0021).
- `pnpm check` must pass before the commit.
