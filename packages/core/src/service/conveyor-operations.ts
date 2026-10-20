import type {
  Absorber,
  Belt,
  CreateAbsorberRequest,
  CreateBeltRequest,
  CreateEmitterRequest,
  CreateGuideRequest,
  CreatePresenceSensorRequest,
  Emitter,
  Guide,
  PantinId,
  PantinResponse,
  PresenceSensor,
  RenamedTagsResponse,
} from "@pantin/protocol";
import {
  ABSORBERS,
  addConveyorItem,
  BELTS,
  deleteConveyorItem,
  EMITTERS,
  GUIDES,
  type KindDescription,
  PRESENCE_SENSORS,
  renameConveyorTagKey,
  replaceConveyorItem,
  type TaggedKindDescription,
} from "../domain/conveyor-edits.ts";
import { forgetEmitter, forgetPresenceSensor, type PhysicsState } from "../domain/physics-state.ts";
import { forgetTagStates } from "../domain/tag-states.ts";
import { renamedTags, tagStateOwnerPrefix } from "../domain/tags.ts";
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import {
  type OpenPantin,
  type ServiceContext,
  toResponse,
  updateDocument,
} from "./open-pantins.ts";

// Belts, guides, emitters, absorbers and presence sensors of an open Pantin
// (ADR 0043 point 12). Edits go through updateDocument, which rebuilds the
// physics world before the new document is stored (so a refused rebuild leaves
// the edit unapplied) and answers the unsaved-changes flag.

// What a kind forgets of its runtime state when one of its items goes or changes.
type Forgetting = {
  afterChange?: (state: PhysicsState, id: string) => PhysicsState;
  afterDelete?: (state: PhysicsState, id: string) => PhysicsState;
  // The kind owns command tags, whose forced state goes with a deleted item.
  tagOwner?: "emitter";
};

// Runs on the OpenPantin that took the edit, right after updateDocument
// returns, without loading the Pantin again.
function forget(
  openPantin: OpenPantin,
  id: string,
  forgetting: ((state: PhysicsState, id: string) => PhysicsState) | undefined,
): void {
  if (forgetting !== undefined) {
    openPantin.physicsState = forgetting(openPantin.physicsState, id);
  }
}

// Only the kinds that own a tag key (the type says so) can rename it.
function tagKeyRenamingOf<
  Item extends { id: string; assembly: string },
  Request extends { assembly: string },
>(context: ServiceContext, kind: TaggedKindDescription<Item, Request>) {
  return async (pantinId: PantinId, id: string, tagKey: string): Promise<RenamedTagsResponse> => {
    const openPantin = await loadSettledPantin(context, pantinId);
    const before = openPantin.document;
    // Only a tag key changes, so the physics world stays as it is.
    openPantin.document = renameConveyorTagKey(kind, before, id, tagKey);
    return {
      pantin: toResponse(pantinId, openPantin),
      renamedTags: renamedTags(before, openPantin.document),
    };
  };
}

function operationsOf<
  Item extends { id: string; assembly: string },
  Request extends { name: string; assembly: string },
>(context: ServiceContext, kind: KindDescription<Item, Request>, forgetting: Forgetting = {}) {
  return {
    create: async (pantinId: PantinId, request: Request): Promise<Item> => {
      await loadSettledPantin(context, pantinId);
      let created: Item | undefined;
      await updateDocument(context, pantinId, (document) => {
        const added = addConveyorItem(kind, document, request);
        created = added.item;
        return added.document;
      });
      if (created === undefined) {
        throw new Error(`The new ${kind.label} was not created.`);
      }
      return created;
    },
    replace: async (pantinId: PantinId, id: string, request: Request): Promise<Item> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      let replaced: Item | undefined;
      await updateDocument(context, pantinId, (document) => {
        const changed = replaceConveyorItem(kind, document, id, request);
        replaced = changed.item;
        return changed.document;
      });
      if (replaced === undefined) {
        throw new Error(`The ${kind.label} "${id}" was not replaced.`);
      }
      forget(openPantin, id, forgetting.afterChange);
      return replaced;
    },
    remove: async (pantinId: PantinId, id: string): Promise<PantinResponse> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const response = await updateDocument(context, pantinId, (document) =>
        deleteConveyorItem(kind, document, id),
      );
      forget(openPantin, id, forgetting.afterDelete);
      if (forgetting.tagOwner !== undefined) {
        forgetTagStates(openPantin.tagStates, tagStateOwnerPrefix(forgetting.tagOwner, id));
      }
      return response;
    },
  };
}

export function conveyorOperations(context: ServiceContext) {
  const belts = operationsOf<Belt, CreateBeltRequest>(context, BELTS);
  const guides = operationsOf<Guide, CreateGuideRequest>(context, GUIDES);
  const absorbers = operationsOf<Absorber, CreateAbsorberRequest>(context, ABSORBERS);
  const emitters = operationsOf<Emitter, CreateEmitterRequest>(context, EMITTERS, {
    afterDelete: forgetEmitter,
    tagOwner: "emitter",
  });
  const presenceSensors = operationsOf<PresenceSensor, CreatePresenceSensorRequest>(
    context,
    PRESENCE_SENSORS,
    { afterChange: forgetPresenceSensor, afterDelete: forgetPresenceSensor },
  );
  return {
    createBelt: belts.create,
    updateBelt: belts.replace,
    deleteBelt: belts.remove,
    createGuide: guides.create,
    updateGuide: guides.replace,
    deleteGuide: guides.remove,
    createAbsorber: absorbers.create,
    updateAbsorber: absorbers.replace,
    deleteAbsorber: absorbers.remove,
    createEmitter: emitters.create,
    updateEmitter: emitters.replace,
    deleteEmitter: emitters.remove,
    renameEmitterTagKey: tagKeyRenamingOf(context, EMITTERS),
    createPresenceSensor: presenceSensors.create,
    updatePresenceSensor: presenceSensors.replace,
    deletePresenceSensor: presenceSensors.remove,
    renamePresenceSensorTagKey: tagKeyRenamingOf(context, PRESENCE_SENSORS),
  };
}
