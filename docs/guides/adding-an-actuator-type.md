# Adding an actuator type

An actuator is what a drive feeds: a cylinder, a motor (ADR 0028). It has no
tag. It reads the states of its **input ports**, which a feed maps to output
ports of a drive, and moves joints. An actuator type is one folder in
`packages/actuator-types/src/` and one line in each of its three registries,
the same layout as a drive type (docs/guides/adding-a-drive-type.md). The
steps below use a hypothetical `example_actuator` type in
`src/example-actuator/`; replace it with the real name.

Before you start:

- An actuator moves joints of one coordinate unit and owns no state: it
  answers the next position and velocity of each joint from the port states
  of the step. Loads are for a later ADR.
- Its ports are of one domain each (`pneumatic`, `ac_power`, `servo`, in
  `packages/drive-types/src/ports.ts`). A drive port can feed it only if the
  domains match; a new domain starts in `ports.ts`.
- This package imports the port state schemas of drive-types and nothing
  else of it, never a behaviour (enforced by `pnpm boundaries`).

## 1. The schema: `schema.ts`

Data only, since the protocol imports it.

```ts
import { z } from "zod";
import {
  type ActuatorInputPort,
  type ActuatorParameter,
  type DefaultFeed,
  positiveRate,
} from "../schema-common.ts";

// One line saying what the actuator does.
export const ExampleActuatorFieldsSchema = z.object({
  type: z.literal("example_actuator"),
  nominalSpeed: positiveRate("nominal speed"),
});

// In the unit of the moved joints, per second; clients show mm or degrees.
export const EXAMPLE_ACTUATOR_PARAMETERS = [
  { field: "nominalSpeed", kind: "speed" },
] as const satisfies readonly ActuatorParameter[];

export const EXAMPLE_ACTUATOR_INPUT_PORTS = [
  { name: "in", domain: "ac_power" },
] as const satisfies readonly ActuatorInputPort[];

// For each input port, the output port names to look for on the chosen drive,
// most preferred first: the first one the drive has is used. Clients use it
// to fill a feed on creation.
export const EXAMPLE_ACTUATOR_DEFAULT_FEED = {
  in: ["out"],
} as const satisfies DefaultFeed;
```

## 2. The behaviour: `behaviour.ts`

One step (1/120 s) as a pure function of plain numbers. `ports` is `null`
when the actuator has no feed: hold the joints. The helpers of
`behaviour-common.ts` read a port by domain (`pneumaticPort`, `acPowerPort`,
`servoPort`) and move joints (`travelAtSpeed`, `moveAtVelocity`,
`holdPosition`); a missing port reads `undefined`, which also means hold.

```ts
import type { z } from "zod";
import { acPowerPort, holdPosition, moveAtVelocity } from "../behaviour-common.ts";
import type { ActuatorBehaviour } from "../behaviour-step-common.ts";
import type { ExampleActuatorFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ExampleActuatorFieldsSchema>;

// Why it moves the way it does, in a comment.
export const exampleActuator: ActuatorBehaviour<Fields> = {
  step: ({ fields, ports, joints, dt }) => {
    const power = acPowerPort(ports, "in");
    return {
      joints: joints.map((joint) =>
        power === undefined
          ? holdPosition(joint)
          : moveAtVelocity(joint, power.direction * power.ratio * fields.nominalSpeed, dt),
      ),
    };
  },
};
```

The core handles the joint faults around your behaviour: a jammed joint keeps
its position whatever you answer.

## 3. The labels: `labels.ts`

English and French, for the parameters and the input ports. The type after
`satisfies` makes a missing label a compile error.

```ts
import type { ActuatorTypeLabels } from "../schema-common.ts";
import type { EXAMPLE_ACTUATOR_INPUT_PORTS, EXAMPLE_ACTUATOR_PARAMETERS } from "./schema.ts";

export const EXAMPLE_ACTUATOR_LABELS = {
  en: { name: "Example actuator", parameters: { nominalSpeed: "Nominal speed" }, ports: { in: "Power input" } },
  fr: { name: "Actionneur d'exemple", parameters: { nominalSpeed: "Vitesse nominale" }, ports: { in: "Alimentation" } },
} satisfies ActuatorTypeLabels<
  (typeof EXAMPLE_ACTUATOR_PARAMETERS)[number]["field"],
  (typeof EXAMPLE_ACTUATOR_INPUT_PORTS)[number]["name"]
>;
```

## 4. The registries

- `src/schemas.ts`: the schema in `ActuatorFieldsSchema`, then
  `ACTUATOR_PARAMETERS`, `ACTUATOR_INPUT_PORTS` and `ACTUATOR_DEFAULT_FEEDS`;
- `src/behaviours.ts`: `ACTUATOR_BEHAVIOURS`;
- `src/labels.ts`: `ACTUATOR_LABELS`.

## 5. Tests, then the schema version

- Step the behaviour through `stepActuator` at 1/120 s, as
  `src/behaviours.test.ts` does: each port state, `ports: null`, the limits.
- `src/schemas.test.ts` checks the registries, and that the default feeds name
  ports that drives have, in matching domains.
- A new actuator type changes what `pantin.json` accepts: raise
  `PANTIN_SCHEMA_VERSION` with a migration step (CLAUDE.md section 14.6), then
  run `pnpm schema:generate` (ADR 0021).
- `pnpm check` must pass before the commit.
