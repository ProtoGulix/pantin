# Adding a sensor type

A sensor type is one folder in `packages/sensor-types/src/` and one line in
each of its registries (ADR 0023, ADR 0025). Nothing else in the core, the
protocol or the viewer names a sensor type: the tags, the REST API, the
sensors panel and the 3D markers pick the new type up from the registries.
The steps below use a hypothetical `example_switch` type in
`src/example-switch/`; replace it with the real name.

Before you start:

- A joint sensor watches one movable joint and has fixed tags, all feedback:
  the PLC reads them, never writes them. A variant with other tags is another
  type, not an option.
- **A switch** (an on/off output driven by where the joint is) needs no
  evaluation code: it describes its zones in `zone.ts`, and one shared
  evaluation gives it hysteresis (ADR 0025). Start from the datasheet: which
  position switches it on, and how far back it must go to switch off.
- **Anything else** (a counter, an analog value) writes its own pure
  evaluation, like `src/encoder/evaluate.ts`. It receives the joint position
  and the state it returned at the previous step (null before the first).
- Delays and contact bounce are not simulated (ADR 0025 point 5).

## 1. The schema: `schema.ts`

Data only, since the protocol imports it; a dependency rule refuses any import
of an evaluation from here.

```ts
import { z } from "zod";
import {
  finiteNumber,
  NORMALLY_CLOSED_PARAMETER,
  nonNegativeNumber,
  SWITCH_TAGS,
  type SensorParameter,
} from "../schema-common.ts";

// One line saying what the sensor detects, and where its values come from.
export const ExampleSwitchFieldsSchema = z.object({
  type: z.literal("example_switch"),
  threshold: finiteNumber("threshold"),
  hysteresis: nonNegativeNumber("hysteresis"),
  normallyClosed: z.boolean(),
});

// Kinds: coordinateRange, coordinate (a position or length along the joint),
// pulsesPerUnit, percent, choice (with `options`), flag.
export const EXAMPLE_SWITCH_PARAMETERS = [
  { field: "threshold", kind: "coordinate" },
  { field: "hysteresis", kind: "coordinate" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const EXAMPLE_SWITCH_TAGS = SWITCH_TAGS;
```

## 2. The zones of a switch: `zone.ts`

Pure geometry along the joint coordinate. `on`: where an off switch turns
on; `hold`: where an on switch stays on (the hysteresis); `shown`: the finite
stretch the 3D view draws. Bounds may be infinite (`beyond`).

```ts
import type { z } from "zod";
import { beyond, type SwitchZones } from "../switch-zones.ts";
import type { ExampleSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleSwitchFieldsSchema>;

// On past the threshold, off once back by the hysteresis; the band between
// the two is what the 3D view draws.
export function exampleSwitchZones(fields: Fields): SwitchZones {
  const release = fields.threshold - fields.hysteresis;
  return {
    on: beyond(fields.threshold, "increasing"),
    hold: beyond(release, "increasing"),
    shown: [release, fields.threshold],
  };
}
```

A type that is not a switch writes `evaluate.ts` instead, returning its tag
values and its state (see `src/encoder/evaluate.ts`).

## 3. The labels: `labels.ts`

English and French, choice options included. The type after `satisfies`
makes a missing or misspelled label a compile error.

```ts
import type { SensorTypeLabels } from "../schema-common.ts";
import type { EXAMPLE_SWITCH_PARAMETERS, EXAMPLE_SWITCH_TAGS } from "./schema.ts";

export const EXAMPLE_SWITCH_LABELS = {
  en: {
    name: "Example switch",
    parameters: { threshold: "Threshold", hysteresis: "Hysteresis", normallyClosed: "Normally closed" },
    tags: { state: "State" },
  },
  fr: {
    name: "Contact d'exemple",
    parameters: { threshold: "Seuil", hysteresis: "Hystérésis", normallyClosed: "Normalement fermé" },
    tags: { state: "État" },
  },
} satisfies SensorTypeLabels<
  (typeof EXAMPLE_SWITCH_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_SWITCH_TAGS)[number]["member"]
>;
```

## 4. The registries

Add the new entry to each; the records are keyed by type, so the compiler
lists every place you missed:

- `src/schemas.ts`: the schema in `SensorFieldsSchema`, then
  `SENSOR_PARAMETERS` and `SENSOR_TAGS`;
- `src/zones.ts`: `SWITCH_ZONES`, with the type's zones for a switch (a type
  with a `normallyClosed` field), or `null` for any other type, which then
  gets its evaluation in `src/evaluators.ts`;
- `src/labels.ts`: `SENSOR_LABELS`.

A new parameter kind also needs the sensors panel to show and convert it
(`packages/viewer/src/sensors/parameter-texts.ts`): discuss it first.

## 5. Tests, then the schema version

- Step the sensor along positions with `statesAlong` (`src/test-support.ts`):
  the switch-on point, the hysteresis both ways, and the schema's refusals.
  See `src/switches.test.ts`.
- Add a valid sample of the type to `SAMPLES` in `src/sensor-types.test.ts`
  (the compiler asks for it): the registry test then checks its labels, its
  zones and that it evaluates to every tag it declares.
- A new sensor type changes what `pantin.json` accepts: raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` for the JSON Schema (ADR 0021).
- `pnpm check` must pass before the commit.
