# Adding a sensor type

A sensor type is one folder in `packages/sensor-types/src/` and one line in
each of its three registries (ADR 0023). Nothing else in the core, the
protocol or the viewer names a sensor type: the tags, the REST API and the
sensors panel pick the new type up from the registries. The steps below use a
hypothetical `example_sensor` type in `src/example-sensor/`; replace it with
the real name.

Before you start:

- A joint sensor watches one movable joint and has fixed tags, all feedback:
  the PLC reads them, never writes them. A variant with other tags is another
  type, not an option.
- A sensor has no state: its values are a pure function of the joint's
  position, computed whenever tags are read (ADR 0023 point 4). A sensor that
  needs memory (a delay, a latch) is a new decision, not a new folder.
- The evaluation is code. It is reviewed like any core change and never
  loaded at run time from elsewhere (CLAUDE.md section 11.3).

## 1. The schema: `schema.ts`

Data only, since the protocol imports it; a dependency rule refuses any import
of an evaluation from here.

```ts
import { z } from "zod";
import type { SensorParameter, SensorTag } from "../schema-common.ts";

// One line saying what the sensor detects.
export const ExampleSensorFieldsSchema = z.object({
  type: z.literal("example_sensor"),
  threshold: z.number().refine(Number.isFinite, "The threshold must be a finite number."),
});

// Values are in the unit of the watched joint's coordinate (metre or radian);
// the sensors panel shows them in mm or degrees.
export const EXAMPLE_SENSOR_PARAMETERS = [
  { field: "threshold", kind: "coordinateRange" },
] as const satisfies readonly SensorParameter[];

// Members are lowercase English words ("state", "count").
export const EXAMPLE_SENSOR_TAGS = [
  { member: "state", type: "bit", direction: "feedback" },
] as const satisfies readonly SensorTag[];
```

## 2. The evaluation: `evaluate.ts`

A pure function from the joint position to the tag values, by member. Bits
are 0 or 1; integers are whole numbers (use `wrapInt32` from
`evaluation-common.ts` for a counter).

```ts
import type { z } from "zod";
import type { SensorEvaluator } from "../evaluation-common.ts";
import type { ExampleSensorFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleSensorFieldsSchema>;

// Why it reads the way it does, in a comment.
export const exampleSensor: SensorEvaluator<Fields> = {
  evaluate: ({ fields, position }) => ({ state: position >= fields.threshold ? 1 : 0 }),
};
```

## 3. The labels: `labels.ts`

English and French. The type after `satisfies` makes a missing or misspelled
label a compile error.

```ts
import type { SensorTypeLabels } from "../schema-common.ts";
import type { EXAMPLE_SENSOR_PARAMETERS, EXAMPLE_SENSOR_TAGS } from "./schema.ts";

export const EXAMPLE_SENSOR_LABELS = {
  en: { name: "Example sensor", parameters: { threshold: "Threshold" }, tags: { state: "State" } },
  fr: { name: "Capteur d'exemple", parameters: { threshold: "Seuil" }, tags: { state: "État" } },
} satisfies SensorTypeLabels<
  (typeof EXAMPLE_SENSOR_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_SENSOR_TAGS)[number]["member"]
>;
```

## 4. The registries

Add the new entry to each; the records are keyed by type, so the compiler
lists every place you missed:

- `src/schemas.ts`: the schema in `SensorFieldsSchema`, then
  `SENSOR_PARAMETERS` and `SENSOR_TAGS`;
- `src/evaluators.ts`: `SENSOR_EVALUATORS`;
- `src/labels.ts`: `SENSOR_LABELS`.

A new parameter kind (other than `coordinateRange`, `pulsesPerUnit` and
`flag`) also needs the sensors panel to know how to show and type it: that is
a viewer change, to discuss first.

## 5. Tests, then the schema version

- In `src/sensor-types.test.ts`, evaluate the type through `evaluateSensor`:
  each side of every threshold, the bounds themselves, and the schema's
  refusals. The registry test checks the labels and tags on its own.
- A new sensor type changes what `pantin.json` accepts: raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` for the JSON Schema (ADR 0021).
- `pnpm check` must pass before the commit.
