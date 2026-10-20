import {
  type Absorber,
  type Belt,
  type CreateAbsorberRequest,
  type CreateBeltRequest,
  type CreateEmitterRequest,
  type CreateGuideRequest,
  type CreatePresenceSensorRequest,
  type Emitter,
  type Guide,
  type PantinDocument,
  PantinDocumentSchema,
  type PresenceSensor,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { keyTaken, type TagKeyOwnerException, tagKeyOwners } from "./tag-keys.ts";
import { parseWithSchema } from "./validation.ts";

// Adding, replacing and deleting belts, guides, emitters, absorbers and
// presence sensors in a document (ADR 0043 point 12), as pure functions.
// One generic module with a small description per kind: the five kinds differ
// only in their array and in whether they own a tag key, so five copies of
// drive-rules.ts would only repeat it. The document schema checks the rest
// (known assembly and body, a continuous drum joint), and the conflicts a
// body or joint change causes are in conveyor-rules.ts.

export type KindDescription<Item extends { id: string }, Request extends { assembly: string }> = {
  // As the messages name it: `belt "feed"`.
  label: string;
  // The id when the name leaves nothing usable.
  fallbackId: string;
  list: (document: PantinDocument) => readonly Item[];
  withList: (document: PantinDocument, items: Item[]) => PantinDocument;
  // `tagKey` is given to the kinds that own one (`tags`), and only to them.
  make: (id: string, request: Request, tagKey: string | undefined) => Item;
  // Only emitters and presence sensors own a tag key.
  tags?: {
    keyOf: (item: Item) => string;
    withKey: (item: Item, tagKey: string) => Item;
    except: (id: string) => TagKeyOwnerException;
  };
};

// A kind that owns a tag key: the only kind a tag key can be renamed on.
export type TaggedKindDescription<
  Item extends { id: string },
  Request extends { assembly: string },
> = KindDescription<Item, Request> & {
  tags: NonNullable<KindDescription<Item, Request>["tags"]>;
};

// The kinds with `tags` are always given their key.
function ownedKey(tagKey: string | undefined): string {
  if (tagKey === undefined) {
    throw new Error("A kind with tags was made without a tag key.");
  }
  return tagKey;
}

export const BELTS: KindDescription<Belt, CreateBeltRequest> = {
  label: "belt",
  fallbackId: "belt",
  list: (document) => document.belts,
  withList: (document, belts) => ({ ...document, belts }),
  make: (id, request) => ({ id, ...request }),
};

export const GUIDES: KindDescription<Guide, CreateGuideRequest> = {
  label: "guide",
  fallbackId: "guide",
  list: (document) => document.guides,
  withList: (document, guides) => ({ ...document, guides }),
  make: (id, request) => ({ id, ...request }),
};

export const ABSORBERS: KindDescription<Absorber, CreateAbsorberRequest> = {
  label: "absorber",
  fallbackId: "absorber",
  list: (document) => document.absorbers,
  withList: (document, absorbers) => ({ ...document, absorbers }),
  make: (id, request) => ({ id, ...request }),
};

export const EMITTERS: TaggedKindDescription<Emitter, CreateEmitterRequest> = {
  label: "emitter",
  fallbackId: "emitter",
  list: (document) => document.emitters,
  withList: (document, emitters) => ({ ...document, emitters }),
  make: (id, request, tagKey) => ({ id, tagKey: ownedKey(tagKey), ...request }),
  tags: {
    keyOf: (emitter) => emitter.tagKey,
    withKey: (emitter, tagKey) => ({ ...emitter, tagKey }),
    except: (emitterId) => ({ emitterId }),
  },
};

export const PRESENCE_SENSORS: TaggedKindDescription<PresenceSensor, CreatePresenceSensorRequest> =
  {
    label: "presence sensor",
    fallbackId: "presence-sensor",
    list: (document) => document.presenceSensors,
    withList: (document, presenceSensors) => ({ ...document, presenceSensors }),
    make: (id, request, tagKey) => ({ id, tagKey: ownedKey(tagKey), ...request }),
    tags: {
      keyOf: (sensor) => sensor.tagKey,
      withKey: (sensor, tagKey) => ({ ...sensor, tagKey }),
      except: (presenceSensorId) => ({ presenceSensorId }),
    },
  };

type Edited<Item> = { document: PantinDocument; item: Item };

function validated<Item extends { id: string }, Request extends { assembly: string }>(
  kind: KindDescription<Item, Request>,
  document: PantinDocument,
  id: string,
  context: string,
): Edited<Item> {
  const updated = parseWithSchema(PantinDocumentSchema, document, context);
  const stored = kind.list(updated).find((candidate) => candidate.id === id);
  if (stored === undefined) {
    throw new Error(`The ${kind.label} "${id}" vanished while validating the document.`);
  }
  return { document: updated, item: stored };
}

function findItem<Item extends { id: string }, Request extends { assembly: string }>(
  kind: KindDescription<Item, Request>,
  document: PantinDocument,
  id: string,
): Item {
  const item = kind.list(document).find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new ApiError("not_found", `This Pantin has no ${kind.label} "${id}".`);
  }
  return item;
}

/** Its id (and tag key) come from its name, unique among its kind (and the tag owners). */
export function addConveyorItem<
  Item extends { id: string },
  Request extends { name: string; assembly: string },
>(kind: KindDescription<Item, Request>, document: PantinDocument, request: Request): Edited<Item> {
  const baseKey = slugifyDisplayName(request.name, kind.fallbackId);
  const id = makeUniqueId(baseKey, new Set(kind.list(document).map((item) => item.id)));
  const tagKey =
    kind.tags === undefined
      ? undefined
      : makeUniqueId(baseKey, new Set(tagKeyOwners(document, request.assembly).keys()));
  const item = kind.make(id, request, tagKey);
  const edited = kind.withList(document, [...kind.list(document), item]);
  return validated(kind, edited, id, `The new ${kind.label}`);
}

// Every field but the id and the tag key may change; in another assembly the
// tag key must be free (no automatic suffix, ADR 0019).
export function replaceConveyorItem<
  Item extends { id: string },
  Request extends { assembly: string },
>(
  kind: KindDescription<Item, Request>,
  document: PantinDocument,
  id: string,
  request: Request,
): Edited<Item> {
  const existing = findItem(kind, document, id);
  const tagKey = kind.tags?.keyOf(existing);
  if (kind.tags !== undefined && tagKey !== undefined) {
    const owner = tagKeyOwners(document, request.assembly, kind.tags.except(id)).get(tagKey);
    if (owner !== undefined) {
      throw new ApiError(
        "conflict",
        `Tag key "${tagKey}" of ${kind.label} "${id}" is already used by ${owner} in assembly "${request.assembly}". Rename one of the tag keys first.`,
      );
    }
  }
  const items = kind
    .list(document)
    .map((item) => (item.id === id ? kind.make(id, request, tagKey) : item));
  return validated(kind, kind.withList(document, items), id, `The changed ${kind.label}`);
}

export function deleteConveyorItem<
  Item extends { id: string },
  Request extends { assembly: string },
>(kind: KindDescription<Item, Request>, document: PantinDocument, id: string): PantinDocument {
  findItem(kind, document, id);
  return kind.withList(
    document,
    kind.list(document).filter((item) => item.id !== id),
  );
}

/** The key was checked as a key by the request schema; here it must be free in the assembly. */
export function renameConveyorTagKey<
  Item extends { id: string; assembly: string },
  Request extends { assembly: string },
>(
  kind: TaggedKindDescription<Item, Request>,
  document: PantinDocument,
  id: string,
  tagKey: string,
): PantinDocument {
  const item = findItem(kind, document, id);
  const taken = tagKeyOwners(document, item.assembly, kind.tags.except(id));
  const owner = taken.get(tagKey);
  if (owner !== undefined) {
    const takenKeys = new Set([...taken.keys(), kind.tags.keyOf(item)]);
    throw keyTaken(tagKey, `${owner} in assembly "${item.assembly}"`, takenKeys);
  }
  const renamed = kind.tags.withKey(item, tagKey);
  return kind.withList(
    document,
    kind.list(document).map((candidate) => (candidate.id === id ? renamed : candidate)),
  );
}
