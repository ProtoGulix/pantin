# Adding a transport

A transport is a way the PLC reaches a Pantin: Modbus TCP today, others later.
It is one folder in `packages/transport-types/src/` and one line in each of
the registries (ADR 0064 point 3, after ADR 0022 and ADR 0028). The core
dispatches through the registries and never names a kind, so a new transport
changes no validation, allocation, GVL or CSV code. The steps below use a
hypothetical `example_client` transport in `src/example-client/`; replace it
with the real name. The existing folder to copy is `src/modbus-tcp-slave/`.

Before you start:

- The kind names the role: `modbus_tcp_slave` is Pantin playing the I/O
  modules, a later `modbus_tcp_master` would be Pantin polling the PLC. A role
  is its own kind.
- io.json version 2 already has the room: a module is `{ key, transport,
  channels }`, the transport is an object told apart by its `kind`, and a
  channel carries one object named after its transport (`modbus` for Modbus).
  Adding a kind adds members to those unions; it does not change the shape of
  the file, so version 2 files stay valid. Anything that does change the shape
  needs a new `schema_version` and a migration (`core/src/domain/io-migrations.ts`).
- A transport needs a bridge, a process of its own that the core spawns
  (ADR 0064 point 8). That is a separate piece of work with its own decision;
  this guide covers the descriptor side.

## 1. The schema: `schema.ts`

Data only, since the protocol imports it. A dependency rule refuses any import
of the rules from here, however indirect.

```ts
import { z } from "zod";

export const EXAMPLE_CLIENT_KIND = "example_client";

// The settings of a module, in io.json under `transport`.
export const ExampleClientTransportSchema = z.strictObject({
  kind: z.literal(EXAMPLE_CLIENT_KIND),
  endpoint: z.string().min(1),
  timeoutMilliseconds: z.number().int().min(100).default(1000),
});

// The same settings for the edit requests: an absent one means "unchanged".
export const ExampleClientPatchSchema = z.strictObject({
  kind: z.literal(EXAMPLE_CLIENT_KIND),
  endpoint: z.string().min(1).optional(),
  timeoutMilliseconds: z.number().int().min(100).optional(),
});

// What a channel of this transport carries, in io.json under `example`.
export const ExampleChannelSchema = z.strictObject({ nodeId: z.string().min(1) });
export const ExampleChannelPatchSchema = z.strictObject({ nodeId: z.string().min(1).optional() });

// The codes the rules of this transport may report, on top of the common ones.
export const EXAMPLE_PROBLEM_CODES = ["node_id_used_twice"] as const;
```

## 2. The rules: `rules.ts`

Pure functions, exported as one object of type `TransportRules`
(`src/rule-types.ts`). Read that interface: it lists everything the core asks
of a transport.

- `supportsSignal`: false for a (type, direction) pair the transport cannot
  carry; the core then reports `unsupported_signal` and refuses to map it.
- `listenPort`: the port the module listens on, or null if it does not listen.
  The core refuses two modules on one port, whatever their kinds.
- `createTransport`, `patchTransport`, `orderedTransport`: the settings of a new
  module, an edit, and the settings with their keys in canonical order.
- `proposeChannel`, `reshapeChannel`, `patchChannel`, `orderedChannelFields`,
  `compareChannels`: the fields a new channel gets, how they follow a change of
  tag or module, a hand edit, and the order of the channels in the file.
- `validateModule`: the transport's own rules for one module, as problems whose
  path starts inside the module (`["channels", 2, "example", "nodeId"]`).
  The core adds `["modules", index]` in front.

A rule that needs the whole document (a tag that does not exist, a variable used
twice) is a common rule and stays in the core.

## 3. The labels: `labels.ts`

English and French. The type after `satisfies` makes a missing label a compile
error; the registry test fails if the two languages have different keys.

```ts
import type { TransportLabels } from "../schema-common.ts";

export const EXAMPLE_CLIENT_LABELS = {
  en: { name: "Example client", settings: { /* ... */ }, channelFields: { /* ... */ }, values: {} },
  fr: { name: "Client d'exemple", settings: { /* ... */ }, channelFields: { /* ... */ }, values: {} },
} satisfies Record<"en" | "fr", TransportLabels<"endpoint", "nodeId", never>>;
```

## 4. The presentation: `presentation.ts`

Pure English text, in a `TransportPresentation` object: the transport's name,
where a PLC reaches the module (`endpointText`), where a channel sits
(`addressText`) and its PLC type (`plcTypeText`). The CSV export and the GVL
header are built from them.

## 5. The registries

One line in each, and nothing else:

- `src/schemas.ts`: `export *` of the new `schema.ts`; the kind in
  `TRANSPORT_KINDS`; the transport schema in `TransportConfigSchema` and the
  patch schema in `TransportPatchSchema` (both `z.discriminatedUnion` lists);
  the channel object in `CHANNEL_TRANSPORT_SHAPE` and its patch in
  `CHANNEL_PATCH_TRANSPORT_SHAPE`, under the key that names it; that key in
  `CHANNEL_KEYS` and `CHANNEL_KEY_BY_KIND`; the problem codes in
  `TRANSPORT_PROBLEM_CODES`.
- `src/rules.ts`, `src/labels.ts`, `src/presentation.ts`: the new object under
  its kind.

Then regenerate what is generated: `pnpm schema:generate` for the JSON Schema of
io.json, and the shared fixture `packages/protocol/fixtures/io-mapping-responses.json`
if its cases should show the new kind (the Python bridge decodes the same file).

## 6. Tests

- A rules test in the folder, as `src/modbus-tcp-slave/rules.test.ts`.
- `src/registry.test.ts` already loops over every kind: it fails until the
  four registries and the channel key are complete.
- A scenario in the core's route tests if the transport changes how a module is
  edited.

`pnpm check` also enforces the import rules: the protocol reaches only the
schema files, the viewer never imports a `rules` file, and a schema file never
reaches a rules file.

## What stays out

The viewer and the core do not change for the descriptor itself. What does need
code is the bridge for the protocol, the supervisor check that starts it, and,
in the viewer, whatever columns the I/O view should show for the kind (taken
from the labels and the presentation).
