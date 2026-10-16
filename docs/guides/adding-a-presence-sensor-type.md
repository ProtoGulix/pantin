# Adding a presence sensor type

A presence sensor looks at products, not at a joint: the core casts a ray from
its frame after each physics step and the type turns "a product was hit or
not" into tag values (ADR 0043 points 7 and 8). Presence sensors are the
second family of `packages/sensor-types/src/`, with their own records beside
the joint sensors' (see [adding-a-sensor-type.md](adding-a-sensor-type.md) for
those). The only member today is `photoelectric`. A new type is one folder and
one line in each presence record. The steps below use a hypothetical
`example_cell` type in `src/example-cell/`; replace it with the real name.

Unlike the joint family, one part is not a registry yet: the core feeds every
type the same ray, and the evaluation names `photoelectric` directly and two
places in the viewer assume its fields (`mode`, the default texts). Section 4 lists them. Add the second type with that
in mind; do not copy the code around it.

Before you start:

- A presence sensor is its own array in the document, `presenceSensors`, with
  an `assembly`, an optional `body` and a `placement` (ADR 0043 point 1; see
  [pantin-document.md](pantin-document.md)). It is not a joint sensor and has
  no `joint`.
- What the core gives the type is one boolean per step: a product is within
  `range` along +Z of the sensor frame, or not. The ray sees products only,
  never belts or guides (ADR 0043 point 7). A type that needs more, such as
  the material for an inductive sensor, is not just a new folder: it needs
  more from the ray first. See `docs/backlog/inductive-presence-sensor.md`.
- Delays are counted in whole steps, `Math.round(delay / stepSeconds)`, so a
  run never depends on floating-point time sums. Do the same.

## 1. The schema: `schema.ts`

Data only, since the protocol imports it. It is the same shape as a joint
sensor's, minus the placement rule.

```ts
import { z } from "zod";
import {
  NORMALLY_CLOSED_PARAMETER,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
} from "../schema-common.ts";

// One line saying what the sensor detects and its units. Lengths in metres,
// durations in seconds.
export const ExampleCellFieldsSchema = z.object({
  type: z.literal("example_cell"),
  range: positiveNumber("range"),
  normallyClosed: z.boolean(),
});

// Kinds: length (mm in clients), duration (ms in clients), choice (with
// `options`), flag, and the others of SensorParameterKind.
export const EXAMPLE_CELL_PARAMETERS = [
  { field: "range", kind: "length" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const EXAMPLE_CELL_TAGS = SWITCH_TAGS;
```

`SWITCH_TAGS` is one feedback bit, `state`. The tag is then
`<assembly>.<tagKey>.state`. A type with other tags lists them here.

## 2. The evaluation: `evaluate.ts`

A pure function from the raw signal and the state of the previous step to the
tag values and the new state. The core stores the state and passes it back,
null before the first step. Nothing is kept in the module.

```ts
import type { z } from "zod";
import type { PresenceSensorEvaluator } from "../evaluation-common.ts";
import type { ExampleCellFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleCellFieldsSchema>;

export const exampleCell: PresenceSensorEvaluator<Fields> = {
  evaluate: ({ fields, signal }) => {
    const raw = signal ? 1 : 0;
    return { values: { state: fields.normallyClosed ? 1 - raw : raw }, state: {} };
  },
};
```

`src/photoelectric/evaluate.ts` is the full example: the state holds the
confirmed value and how many steps the raw signal has disagreed with it, which
is what the on and off delays need.

## 3. The labels: `labels.ts`

English and French, with a label for every parameter, tag member and choice
option. The type after `satisfies` makes a missing or misspelled label a
compile error. See `src/photoelectric/labels.ts`, which also gives the
`options` of its `mode` choice.

```ts
import type { SensorTypeLabels } from "../schema-common.ts";
import type { EXAMPLE_CELL_PARAMETERS, EXAMPLE_CELL_TAGS } from "./schema.ts";

export const EXAMPLE_CELL_LABELS = {
  en: {
    name: "Example cell",
    parameters: { range: "Range", normallyClosed: "Normally closed" },
    tags: { state: "State" },
  },
  fr: {
    name: "Cellule d'exemple",
    parameters: { range: "Portée", normallyClosed: "Normalement fermé" },
    tags: { state: "État" },
  },
} satisfies SensorTypeLabels<
  (typeof EXAMPLE_CELL_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_CELL_TAGS)[number]["member"]
>;
```

## 4. The registries

Add the new entry to each. The records are keyed by type, so the compiler
lists most of what you missed:

- `src/schemas.ts`: the schema in `PresenceSensorFieldsSchema` (a
  discriminated union on `type`), then `PRESENCE_SENSOR_PARAMETERS` and
  `PRESENCE_SENSOR_TAGS`;
- `src/labels.ts`: `PRESENCE_SENSOR_LABELS`.

Three places do not follow the type and must be changed by hand. The compiler
is expected to flag some of them once the union has a second member (NOT
VERIFIED: nobody has added a second type yet). Either way, change all three:

- `src/evaluators.ts`, `evaluatePresenceSensor`: it calls
  `photoelectric.evaluate` whatever the type. Make it choose by
  `input.fields.type`, as `evaluateSensor` does for the joint family, and add
  a test that each type gets its own evaluation.
- `packages/viewer/src/conveyors/conveyor-drawing.ts` (`beamParts(sensor.mode,
  ...)`) reads `sensor.mode` to draw the beam. Draw the new type's beam from
  its own fields.
- `packages/viewer/src/conveyors/conveyor-form.ts` has
  `PRESENCE_DEFAULT_TEXTS` (`range`, `onDelay`, `offDelay`), the starting
  values of the create form for every type. Check that they suit the new type
  and add its own defaults if not.

Nothing else in the core or the protocol names a presence type. For what the
core does with it:

- `core/src/domain/presence-step.ts` builds one ray per sensor from its
  `placement` and `range`, and `evaluatePresence` turns the hit (a distance,
  or null) into `signal` for `evaluatePresenceSensor`, with the state of the
  previous step and `STEP_SECONDS`. The cast itself is
  `core/src/service/physics-runtime.ts`.
- `core/src/domain/tag-entries.ts` lists the type's tags from
  `PRESENCE_SENSOR_TAGS`, after the joint sensors' (ADR 0043 point 12).

## 5. What the viewer picks up by itself

The viewer imports the records, not the types, so the new type shows up in:

- the create form: the type selector lists the keys of
  `PRESENCE_SENSOR_PARAMETERS`, and the fields come from the parameters with
  their labels (`conveyors/conveyor-form.ts`, `panel/conveyor-form-model.ts`);
- the inspector and the tag lists (`inspector/conveyor-inspector.ts`,
  `inspector/scope-index.ts`);
- the tree row (ADR 0047 point 6): `tree/device-families.ts` shows the label
  of the type as the row detail, and gives the row an on or off mark when the
  type has a tag of type `bit`. That is the registry's optional `state`
  capability: it is read from `PRESENCE_SENSOR_TAGS`, not from a list of types,
  so a type with a bit tag gets the mark with no viewer change. A type with no
  bit tag has none, like the encoder.
- the 3D beam colour: `conveyors/conveyor-drawing.ts` lights the beam from the
  first bit tag, once the drawing handles the type (section 4).

A new parameter kind is not picked up: the forms need to show and convert it
(`packages/viewer/src/sensors/parameter-texts.ts`). Discuss it first.

## 6. Tests, then the schema version

- In the type's folder, test the evaluation: the beam seen and not seen, both
  contact types, each delay and a flicker shorter than the delay. Follow
  `src/photoelectric/evaluate.test.ts`, which steps a string of signals
  (`"0011100"`) and compares the `state` tag.
- Test the schema's refusals (zero range, negative delay) and the registries,
  as `src/photoelectric/photoelectric.test.ts` does: one entry per type in
  each record, and a label for every field in both languages. That test
  asserts the list of types is exactly `["photoelectric"]`; update it.
- A scene test in the core is worth one case, to prove that the ray, the
  placement and the type work together. The exit test of phase 6 does this for
  the photoelectric cell (ADR 0043 point 15, P2).
- A new type changes what `pantin.json` accepts, since the `type` union has a
  new member. Following the rule used for sensor types, raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` (ADR 0021). The step may change nothing but the
  version, as `migrateV10ToV11` does. NOT VERIFIED: whether a purely additive
  union member needs the bump, since older files stay valid; the sensor guide
  says yes, and no presence type has been added since version 12 to confirm.
- `pnpm check` must pass before the commit.
